import type {
  GenerationReport,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  TrainingCandidateResult,
} from '@snake-game/core';

export type TrainingWorkerRequest = {
  type: 'start';
  config: GeneticTrainingConfig;
};

export type TrainingWorkerResponse =
  | {
      type: 'generation';
      report: GenerationReport;
      generationBest: TrainingCandidateResult;
      recordFitness: number;
    }
  | { type: 'completed'; result: GeneticTrainingResult }
  | { type: 'failed'; message: string };
