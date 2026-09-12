import { GeneticTrainingSession } from '@snake-game/core';
import type { TrainingWorkerRequest, TrainingWorkerResponse } from './messages';
import { TrainingEvaluationWorkerPool } from './TrainingEvaluationWorkerPool';

interface GeneticTrainingWorkerScope {
  onmessage: ((event: MessageEvent<TrainingWorkerRequest>) => void) | null;
  postMessage(message: TrainingWorkerResponse): void;
}

const workerScope = self as unknown as GeneticTrainingWorkerScope;
let pauseRequested = false;
let running = false;

workerScope.onmessage = (event: MessageEvent<TrainingWorkerRequest>) => {
  if (event.data.type === 'pause') {
    pauseRequested = true;
    return;
  }
  if (running) return;
  running = true;
  pauseRequested = false;
  logTraining('Start request received', {
    checkpoint: Boolean(event.data.checkpoint),
    fineTuneModelId: event.data.initialModel?.id ?? null,
    population: event.data.config.populationSize,
    workers: event.data.execution.workerCount,
  });
  runTraining(event.data).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[training:coordinator] Training failed', message, error);
    post({ type: 'failed', message });
  }).finally(() => {
    running = false;
  });
};

async function runTraining(request: Extract<TrainingWorkerRequest, { type: 'start' }>): Promise<void> {
  post({
    type: 'progress',
    stage: 'preparing',
    generation: request.checkpoint?.nextGeneration ?? 1,
    completed: 0,
    total: request.config.populationSize,
    workerCount: request.execution.workerCount,
  });
  const session = new GeneticTrainingSession(request.config, {
    checkpoint: request.checkpoint,
    initialModel: request.initialModel,
  });
  const pool = new TrainingEvaluationWorkerPool(
    request.execution.workerCount,
    () => new Worker(new URL('./geneticEvaluation.worker.ts', import.meta.url)),
  );
  try {
    while (!session.isComplete()) {
      const startedAt = Date.now();
      const generation = session.getNextGeneration();
      const tasks = session.createEvaluationTasks();
      const results = await pool.evaluate(tasks, (completed, total) => {
        if (!shouldReportProgress(completed, total)) return;
        post({
          type: 'progress',
          stage: 'evaluating',
          generation,
          completed,
          total,
          workerCount: pool.size,
        });
      });
      const prepared = session.prepareGeneration(results);
      const validation = prepared.validationTask
        ? (await pool.evaluate([prepared.validationTask], (completed, total) => {
            post({
              type: 'progress',
              stage: 'validating',
              generation,
              completed,
              total,
              workerCount: pool.size,
            });
          }))[0]
        : undefined;
      const completed = session.completeGeneration(prepared, validation, Date.now() - startedAt);
      post({
        type: 'generation',
        report: completed.report,
        generationBest: completed.generationBest,
        recordFitness: completed.champion.fitness,
        recordGeneration: completed.championGeneration,
        recordValidationFitness: completed.championValidationFitness,
        workerCount: pool.size,
      });

      if (completed.report.generation % request.execution.checkpointEvery === 0) {
        post({
          type: 'checkpoint',
          checkpoint: session.createCheckpoint(),
          model: session.createChampionModel(),
        });
      }
      if (pauseRequested) {
        post({
          type: 'paused',
          checkpoint: session.createCheckpoint(),
          model: session.createChampionModel(),
        });
        return;
      }
    }

    const finalCheckpoint = session.createCheckpoint();
    post({ type: 'completed', result: session.createResult(), runId: finalCheckpoint.runId });
  } finally {
    pool.stop();
  }
}

function post(message: TrainingWorkerResponse): void {
  workerScope.postMessage(message);
}

function shouldReportProgress(completed: number, total: number): boolean {
  if (completed === 0 || completed === total) return true;
  return completed % Math.max(1, Math.ceil(total / 10)) === 0;
}

function logTraining(message: string, details: Record<string, unknown>): void {
  if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
    console.info(`[training:coordinator] ${message} ${JSON.stringify(details)}`);
  }
}
