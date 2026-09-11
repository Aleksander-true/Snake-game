import type { GameMode } from '../engine/types';

export interface TrainingScenarioWeights {
  solo: number;
  heuristic: number;
  cohort: number;
}

export interface FitnessWeights {
  score: number;
  /** Reward per new cell closed toward a tracked food target. */
  approach?: number;
  wins: number;
  survival: number;
  aliveAtLimit: number;
  death: number;
  /** @deprecated Kept in version 1 artifacts; reaching the limit is no longer penalized. */
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
  averageFoodApproach?: number;
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
  ticksPerSecond?: number;
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
  parentModelId?: string;
  parentTrainingFitness?: number;
}

export interface GeneticTrainingResult {
  model: TrainedModelArtifact;
  reports: GenerationReport[];
  completedGenerations: number;
}

export interface GeneticTrainingCallbacks {
  onGenerationCompleted?: (
    report: GenerationReport,
    generationBest: TrainingCandidateResult,
    champion: TrainingCandidateResult,
  ) => void;
  shouldCancel?: () => boolean;
}

export interface TrainingCandidateGenome {
  id: string;
  genome: Float32Array;
}

export interface TrainingEvaluationTask {
  id: string;
  mode: 'training' | 'validation';
  candidate: TrainingCandidateGenome;
  opponent?: TrainingCandidateGenome;
  config: GeneticTrainingConfig;
}

export interface TrainingEvaluationResult {
  taskId: string;
  candidateId: string;
  fitness: number;
  metrics: TrainingEvaluationMetrics;
  simulations: number;
  ticksExecuted: number;
}

export interface SerializedTrainingCandidate {
  id: string;
  genome: number[];
  fitness?: number;
  metrics?: TrainingEvaluationMetrics;
}

export interface GeneticTrainingCheckpoint {
  formatVersion: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  nextGeneration: number;
  config: GeneticTrainingConfig;
  population: SerializedTrainingCandidate[];
  champion: SerializedTrainingCandidate | null;
  championGeneration: number;
  rngState: number;
  reports: GenerationReport[];
  parentModelId?: string;
  parentTrainingFitness?: number;
}

export interface PreparedTrainingGeneration {
  generation: number;
  evaluated: TrainingCandidateResult[];
  champion: TrainingCandidateResult;
  championGeneration: number;
  evaluationResults: TrainingEvaluationResult[];
  validationTask?: TrainingEvaluationTask;
}

export interface CompletedTrainingGeneration {
  report: GenerationReport;
  generationBest: TrainingCandidateResult;
  champion: TrainingCandidateResult;
  championGeneration: number;
}
