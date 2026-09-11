import type {
  GenerationReport,
  GeneticTrainingCheckpoint,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  TrainedModelArtifact,
  TrainingCandidateResult,
  TrainingEvaluationResult,
  TrainingEvaluationTask,
} from '@snake-game/core';

export interface BrowserTrainingExecutionOptions {
  workerCount: number;
  checkpointEvery: number;
}

export type TrainingWorkerRequest =
  | {
      type: 'start';
      config: GeneticTrainingConfig;
      execution: BrowserTrainingExecutionOptions;
      checkpoint?: GeneticTrainingCheckpoint;
      initialModel?: TrainedModelArtifact;
    }
  | { type: 'pause' };

export type TrainingWorkerResponse =
  | {
      type: 'generation';
      report: GenerationReport;
      generationBest: TrainingCandidateResult;
      recordFitness: number;
      recordGeneration: number;
      recordValidationFitness?: number;
      workerCount: number;
    }
  | {
      type: 'checkpoint';
      checkpoint: GeneticTrainingCheckpoint;
      model: TrainedModelArtifact;
    }
  | {
      type: 'paused';
      checkpoint: GeneticTrainingCheckpoint;
      model: TrainedModelArtifact;
    }
  | { type: 'completed'; result: GeneticTrainingResult; runId: string }
  | { type: 'failed'; message: string };

export type EvaluationWorkerRequest = {
  type: 'evaluate';
  task: TrainingEvaluationTask;
};

export type EvaluationWorkerResponse =
  | { type: 'evaluated'; result: TrainingEvaluationResult }
  | { type: 'failed'; taskId: string; message: string };
