import { GeneticTrainingSession, evaluateTrainingTask } from './GeneticTrainingSession';
import type {
  GeneticTrainingCallbacks,
  GeneticTrainingConfig,
  GeneticTrainingResult,
} from './types';

export class TrainingCancelledError extends Error {}

/** Synchronous training runner used by Node.js and deterministic core tests. */
export class GeneticTrainer {
  private readonly session: GeneticTrainingSession;

  constructor(config: GeneticTrainingConfig) {
    this.session = new GeneticTrainingSession(config);
  }

  run(callbacks: GeneticTrainingCallbacks = {}): GeneticTrainingResult {
    while (!this.session.isComplete()) {
      if (callbacks.shouldCancel?.()) throw new TrainingCancelledError('Training was cancelled');
      const startedAt = Date.now();
      const results = this.session.createEvaluationTasks().map(evaluateTrainingTask);
      const prepared = this.session.prepareGeneration(results);
      const validation = prepared.validationTask
        ? evaluateTrainingTask(prepared.validationTask)
        : undefined;
      const completed = this.session.completeGeneration(
        prepared,
        validation,
        Date.now() - startedAt,
      );
      callbacks.onGenerationCompleted?.(
        completed.report,
        completed.generationBest,
        completed.champion,
      );
    }
    return this.session.createResult();
  }
}
