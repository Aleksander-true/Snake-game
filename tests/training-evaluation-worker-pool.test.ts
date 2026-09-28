import type {
  TrainingEvaluationMetrics,
  TrainingEvaluationTask,
} from '@snake-game/core';
import { createDefaultGeneticTrainingConfig, GeneticTrainingSession, evaluateTrainingTask } from '@snake-game/core';
import { TrainingEvaluationWorkerPool } from '../apps/web/src/training/TrainingEvaluationWorkerPool';
import type { EvaluationWorkerRequest, EvaluationWorkerResponse } from '../apps/web/src/training/messages';

const metrics: TrainingEvaluationMetrics = {
  runs: 1,
  averageScore: 0,
  averageFoodEaten: 0,
  averageFoodApproach: 0,
  averageSurvivedTicks: 1,
  averageFinalLength: 1,
  winRate: 0,
  drawRate: 0,
  tickLimitRate: 0,
  aliveRate: 0,
  deathReasons: {},
};

describe('training evaluation worker pool', () => {
  test('v3 results are identical with one or three evaluation workers', async () => {
    class EvaluationWorker {
      onmessage: ((event: MessageEvent<EvaluationWorkerResponse>) => void) | null = null;
      terminate(): void {}
      postMessage(request: EvaluationWorkerRequest): void {
        queueMicrotask(() => this.onmessage?.(new MessageEvent('message', {
          data: { type: 'evaluated', result: evaluateTrainingTask(request.task) },
        })));
      }
    }
    const config = { ...createDefaultGeneticTrainingConfig(86, 3, 3),
      topology: [86, 4, 3], populationSize: 4, eliteCount: 1, tournamentSize: 2,
      maxTicks: 30, scenarioGames: { solo: 1, heuristic: 1, cohort: 1 } };
    const tasks = new GeneticTrainingSession(config).createEvaluationTasks();
    const evaluate = async (count: number) => {
      const pool = new TrainingEvaluationWorkerPool(count, () => new EvaluationWorker() as unknown as Worker);
      try { return await pool.evaluate(tasks, () => undefined); }
      finally { pool.stop(); }
    };
    expect(await evaluate(3)).toEqual(await evaluate(1));
  });
  test('retries a task when a worker response cannot be deserialized', async () => {
    let createdWorkers = 0;
    class FakeWorker {
      readonly number = ++createdWorkers;
      onmessage: ((event: MessageEvent<EvaluationWorkerResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      terminate = jest.fn();

      postMessage(request: EvaluationWorkerRequest): void {
        queueMicrotask(() => {
          if (this.number === 1) {
            this.onmessageerror?.(new MessageEvent('messageerror'));
            return;
          }
          this.onmessage?.(new MessageEvent('message', {
            data: {
              type: 'evaluated',
              result: {
                taskId: request.task.id,
                candidateId: request.task.candidate.id,
                fitness: 1,
                metrics,
                simulations: 1,
                ticksExecuted: 1,
              },
            },
          }));
        });
      }
    }
    const task: TrainingEvaluationTask = {
      id: '1/candidate-1/training',
      mode: 'training',
      candidate: { id: 'candidate-1', genome: new Float32Array([1]) },
      config: createDefaultGeneticTrainingConfig(1, 1),
    };
    const progress: number[] = [];
    const pool = new TrainingEvaluationWorkerPool(
      1,
      () => new FakeWorker() as unknown as Worker,
    );

    const result = await pool.evaluate([task], (completed) => progress.push(completed));
    pool.stop();

    expect(createdWorkers).toBe(2);
    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe(task.id);
    expect(progress).toEqual([0, 1]);
  });
});
