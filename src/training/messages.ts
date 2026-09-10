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
  | { type: 'generation'; report: GenerationReport; champion: TrainingCandidateResult }
  | { type: 'completed'; result: GeneticTrainingResult }
  | { type: 'failed'; message: string };
