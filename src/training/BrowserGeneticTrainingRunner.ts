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
    worker.onmessage = (event: MessageEvent<TrainingWorkerResponse>) => {
      callbacks.onMessage(event.data);
      if (
        event.data.type === 'completed'
        || event.data.type === 'paused'
        || event.data.type === 'failed'
      ) this.stop();
    };
    worker.onerror = (event) => {
      callbacks.onMessage({ type: 'failed', message: event.message || 'Training worker failed' });
      this.stop();
    };
    const request: TrainingWorkerRequest = {
      type: 'start',
      config,
      execution: options.execution,
      checkpoint: options.checkpoint,
      initialModel: options.initialModel,
    };
    worker.postMessage(request);
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
}
