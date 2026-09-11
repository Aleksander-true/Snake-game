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
  runTraining(event.data).catch((error) => {
    post({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }).finally(() => {
    running = false;
  });
};

async function runTraining(request: Extract<TrainingWorkerRequest, { type: 'start' }>): Promise<void> {
  const session = new GeneticTrainingSession(request.config, {
    checkpoint: request.checkpoint,
    initialModel: request.initialModel,
  });
  const pool = new TrainingEvaluationWorkerPool(request.execution.workerCount);
  try {
    while (!session.isComplete()) {
      const startedAt = Date.now();
      const results = await pool.evaluate(session.createEvaluationTasks());
      const prepared = session.prepareGeneration(results);
      const validation = prepared.validationTask
        ? (await pool.evaluate([prepared.validationTask]))[0]
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
