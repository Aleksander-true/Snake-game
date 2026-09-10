import { GeneticTrainer } from '@snake-game/core';
import type { TrainingWorkerRequest, TrainingWorkerResponse } from './messages';

interface GeneticTrainingWorkerScope {
  onmessage: ((event: MessageEvent<TrainingWorkerRequest>) => void) | null;
  postMessage(message: TrainingWorkerResponse): void;
}

const workerScope = self as unknown as GeneticTrainingWorkerScope;

workerScope.onmessage = (event: MessageEvent<TrainingWorkerRequest>) => {
  if (event.data.type !== 'start') return;
  try {
    const trainer = new GeneticTrainer(event.data.config);
    const result = trainer.run({
      onGenerationCompleted: (report, champion) => {
        post({ type: 'generation', report, champion });
      },
    });
    post({ type: 'completed', result });
  } catch (error) {
    post({
      type: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function post(message: TrainingWorkerResponse): void {
  workerScope.postMessage(message);
}
