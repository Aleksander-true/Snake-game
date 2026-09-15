import type {
  TrainingEvaluationMetrics,
  TrainingEvaluationTask,
} from '@snake-game/core';
import { createDefaultGeneticTrainingConfig } from '@snake-game/core';
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
  aliveRate: 0,
  deathReasons: {},
};

describe('training evaluation worker pool', () => {
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
