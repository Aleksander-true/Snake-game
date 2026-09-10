import type { GameMode } from '../engine/types';

export interface TrainingScenarioWeights {
  solo: number;
  heuristic: number;
  cohort: number;
}

export interface FitnessWeights {
  score: number;
  wins: number;
  survival: number;
  aliveAtLimit: number;
  death: number;
  cycle: number;
}

export interface GeneticTrainingConfig {
  populationSize: number;
  generations: number;
  eliteCount: number;
  tournamentSize: number;
  crossoverRate: number;
  mutationRate: number;
  mutationSigma: number;
  topology: number[];
  trainingSeeds: number[];
  validationSeeds: number[];
  validationEvery: number;
  maxTicks: number;
  level: number;
  difficultyLevel: number;
  gameMode: GameMode;
  scenarioWeights: TrainingScenarioWeights;
  fitnessWeights: FitnessWeights;
}

export interface TrainingEvaluationMetrics {
  runs: number;
  averageScore: number;
  averageFoodEaten: number;
  averageSurvivedTicks: number;
  averageFinalLength: number;
  winRate: number;
  aliveRate: number;
  deathReasons: Record<string, number>;
}

export interface TrainingCandidateResult {
  id: string;
  genome: Float32Array;
  fitness: number;
  metrics: TrainingEvaluationMetrics;
}

export interface GenerationReport {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  medianFitness: number;
  diversity: number;
  validationFitness?: number;
  bestMetrics: TrainingEvaluationMetrics;
  validationMetrics?: TrainingEvaluationMetrics;
  elapsedMs: number;
  simulationsPerSecond: number;
}

export interface TrainedModelArtifact {
  formatVersion: 1;
  observationVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  topology: number[];
  genome: number[];
  trainingConfig: GeneticTrainingConfig;
  trainingFitness: number;
  validationFitness?: number;
  metrics: TrainingEvaluationMetrics;
}

export interface GeneticTrainingResult {
  model: TrainedModelArtifact;
  reports: GenerationReport[];
  completedGenerations: number;
}

export interface GeneticTrainingCallbacks {
  onGenerationCompleted?: (report: GenerationReport, champion: TrainingCandidateResult) => void;
  shouldCancel?: () => boolean;
}
