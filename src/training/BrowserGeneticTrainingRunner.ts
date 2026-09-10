import type { GeneticTrainingConfig } from '@snake-game/core';
import type { TrainingWorkerResponse } from './messages';

export interface BrowserTrainingCallbacks {
  onMessage: (message: TrainingWorkerResponse) => void;
}

export class BrowserGeneticTrainingRunner {
  private worker: Worker | null = null;

  start(config: GeneticTrainingConfig, callbacks: BrowserTrainingCallbacks): void {
    if (this.worker) throw new Error('Training is already running');
    const worker = new Worker(new URL('./geneticTraining.worker.ts', import.meta.url));
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<TrainingWorkerResponse>) => {
      callbacks.onMessage(event.data);
      if (event.data.type === 'completed' || event.data.type === 'failed') this.stop();
    };
    worker.onerror = (event) => {
      callbacks.onMessage({ type: 'failed', message: event.message || 'Training worker failed' });
      this.stop();
    };
    worker.postMessage({ type: 'start', config });
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  isRunning(): boolean {
    return this.worker !== null;
  }
}
