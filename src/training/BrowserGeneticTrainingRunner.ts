import type {
  GeneticTrainingCheckpoint,
  GeneticTrainingConfig,
  TrainedModelArtifact,
} from '@snake-game/core';
import type {
  BrowserTrainingExecutionOptions,
  TrainingWorkerRequest,
  TrainingWorkerResponse,
} from './messages';

export interface BrowserTrainingCallbacks {
  onMessage: (message: TrainingWorkerResponse) => void;
}

export interface BrowserTrainingStartOptions {
  execution: BrowserTrainingExecutionOptions;
  checkpoint?: GeneticTrainingCheckpoint;
  initialModel?: TrainedModelArtifact;
}

export class BrowserGeneticTrainingRunner {
  private worker: Worker | null = null;

  start(
    config: GeneticTrainingConfig,
    callbacks: BrowserTrainingCallbacks,
    options: BrowserTrainingStartOptions,
  ): void {
    if (this.worker) throw new Error('Training is already running');
    const worker = new Worker(new URL('./geneticTraining.worker.ts', import.meta.url));
    this.worker = worker;
    logTraining('Starting coordinator', {
      generations: config.generations,
      population: config.populationSize,
      topology: config.topology.join('x'),
      workers: options.execution.workerCount,
      checkpoint: Boolean(options.checkpoint),
      fineTuneModelId: options.initialModel?.id ?? null,
    });
    worker.onmessage = (event: MessageEvent<TrainingWorkerResponse>) => {
      if (!event.data || typeof event.data.type !== 'string') {
        this.fail(worker, callbacks, 'Training worker returned an invalid message');
        return;
      }
      if (event.data.type === 'progress') {
        logTraining('Progress', {
          stage: event.data.stage,
          generation: event.data.generation,
          completed: event.data.completed,
          total: event.data.total,
          workers: event.data.workerCount,
        });
      } else if (event.data.type === 'generation') {
        logTraining('Generation completed', {
          generation: event.data.report.generation,
          elapsedMs: event.data.report.elapsedMs,
          bestFitness: event.data.report.bestFitness,
        });
      } else if (event.data.type === 'failed') {
        console.error('[training] Coordinator reported an error', event.data.message);
      }
      callbacks.onMessage(event.data);
      if (
        event.data.type === 'completed'
        || event.data.type === 'paused'
        || event.data.type === 'failed'
      ) this.stop();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(worker, callbacks, event.message || 'Training worker failed');
    };
    worker.onmessageerror = () => {
      this.fail(worker, callbacks, 'Training worker response could not be deserialized');
    };
    const request: TrainingWorkerRequest = {
      type: 'start',
      config,
      execution: options.execution,
      checkpoint: options.checkpoint,
      initialModel: options.initialModel,
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      this.fail(worker, callbacks, errorMessage(error));
    }
  }

  pause(): void {
    if (!this.worker) return;
    const request: TrainingWorkerRequest = { type: 'pause' };
    this.worker.postMessage(request);
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  isRunning(): boolean {
    return this.worker !== null;
  }

  private fail(
    worker: Worker,
    callbacks: BrowserTrainingCallbacks,
    message: string,
  ): void {
    if (this.worker !== worker) return;
    console.error('[training] Training stopped with an error', message);
    callbacks.onMessage({ type: 'failed', message });
    this.stop();
  }
}

function logTraining(message: string, details: Record<string, unknown>): void {
  if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
    console.info(`[training] ${message} ${JSON.stringify(details)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
