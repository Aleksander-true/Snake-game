import type { TrainingEvaluationResult, TrainingEvaluationTask } from '@snake-game/core';
import type { EvaluationWorkerRequest, EvaluationWorkerResponse } from './messages';

interface QueuedTask {
  task: TrainingEvaluationTask;
  index: number;
  attempts: number;
}

interface WorkerSlot {
  worker: Worker;
  current: QueuedTask | null;
}

/** Owns evaluation worker scheduling, ordering, retry and lifecycle. */
export class TrainingEvaluationWorkerPool {
  private readonly slots: WorkerSlot[];
  private stopped = false;
  private evaluating = false;

  constructor(
    readonly size: number,
    private readonly workerFactory: () => Worker,
  ) {
    if (!Number.isInteger(size) || size < 1) throw new Error('Worker count must be positive');
    this.slots = Array.from({ length: size }, () => ({
      worker: this.createWorker(),
      current: null,
    }));
  }

  evaluate(
    tasks: TrainingEvaluationTask[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<TrainingEvaluationResult[]> {
    if (this.stopped) return Promise.reject(new Error('Evaluation worker pool is stopped'));
    if (this.evaluating) return Promise.reject(new Error('Evaluation batch is already running'));
    if (tasks.length === 0) return Promise.resolve([]);
    this.evaluating = true;
    logTraining('Evaluation batch started', { tasks: tasks.length, workers: this.size });

    return new Promise((resolve, reject) => {
      const queue = tasks.map((task, index) => ({ task, index, attempts: 0 }));
      const results = new Array<TrainingEvaluationResult>(tasks.length);
      let completed = 0;
      let settled = false;
      onProgress?.(0, tasks.length);

      const finishWithError = (message: string) => {
        if (settled) return;
        settled = true;
        this.evaluating = false;
        console.error('[training:pool] Evaluation batch failed', message);
        reject(new Error(message));
      };

      const assign = (slot: WorkerSlot) => {
        if (settled || this.stopped || slot.current) return;
        const queued = queue.shift();
        if (!queued) {
          if (completed === tasks.length) {
            settled = true;
            this.evaluating = false;
            logTraining('Evaluation batch completed', { tasks: tasks.length });
            resolve(results);
          }
          return;
        }
        slot.current = queued;
        const request: EvaluationWorkerRequest = { type: 'evaluate', task: queued.task };
        try {
          slot.worker.postMessage(request);
        } catch (error) {
          retryOrFail(slot, errorMessage(error), true);
        }
      };

      const retryOrFail = (slot: WorkerSlot, message: string, replaceWorker: boolean) => {
        const failed = slot.current;
        slot.current = null;
        if (!failed) return;
        if (replaceWorker) {
          try {
            slot.worker.terminate();
            slot.worker = this.createWorker();
            bind(slot);
          } catch (error) {
            finishWithError(`Could not replace evaluation worker: ${errorMessage(error)}`);
            return;
          }
        }
        if (failed.attempts >= 1) {
          finishWithError(`Evaluation ${failed.task.id} failed twice: ${message}`);
          return;
        }
        logTraining('Retrying evaluation task', {
          taskId: failed.task.id,
          reason: message,
        });
        queue.unshift({ ...failed, attempts: failed.attempts + 1 });
        assign(slot);
      };

      const bind = (slot: WorkerSlot) => {
        slot.worker.onmessage = (event: MessageEvent<EvaluationWorkerResponse>) => {
          if (settled) return;
          const current = slot.current;
          if (!current) return;
          if (!event.data || (event.data.type !== 'failed' && event.data.type !== 'evaluated')) {
            retryOrFail(slot, 'worker returned an invalid response', true);
            return;
          }
          if (event.data.type === 'failed') {
            retryOrFail(slot, event.data.message, false);
            return;
          }
          if (event.data.result.taskId !== current.task.id) {
            retryOrFail(slot, 'worker returned a mismatched task id', true);
            return;
          }
          results[current.index] = event.data.result;
          completed++;
          onProgress?.(completed, tasks.length);
          slot.current = null;
          assign(slot);
        };
        slot.worker.onerror = (event) => {
          event.preventDefault();
          retryOrFail(slot, event.message || 'evaluation worker crashed', true);
        };
        slot.worker.onmessageerror = () => {
          retryOrFail(slot, 'evaluation worker response could not be deserialized', true);
        };
      };

      this.slots.forEach((slot) => {
        bind(slot);
        assign(slot);
      });
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.slots.forEach((slot) => slot.worker.terminate());
  }

  private createWorker(): Worker {
    return this.workerFactory();
  }
}

function logTraining(message: string, details: Record<string, unknown>): void {
  if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
    console.info(`[training:pool] ${message} ${JSON.stringify(details)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
