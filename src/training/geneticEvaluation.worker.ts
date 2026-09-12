import { evaluateTrainingTask } from '@snake-game/core';
import type { EvaluationWorkerRequest, EvaluationWorkerResponse } from './messages';

interface EvaluationWorkerScope {
  onmessage: ((event: MessageEvent<EvaluationWorkerRequest>) => void) | null;
  postMessage(message: EvaluationWorkerResponse): void;
}

const workerScope = self as unknown as EvaluationWorkerScope;

workerScope.onmessage = (event: MessageEvent<EvaluationWorkerRequest>) => {
  if (event.data.type !== 'evaluate') return;
  try {
    workerScope.postMessage({
      type: 'evaluated',
      result: evaluateTrainingTask(event.data.task),
    });
  } catch (error) {
    console.error(
      '[training:evaluation] Task failed',
      event.data.task.id,
      error instanceof Error ? error.message : String(error),
    );
    workerScope.postMessage({
      type: 'failed',
      taskId: event.data.task.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
