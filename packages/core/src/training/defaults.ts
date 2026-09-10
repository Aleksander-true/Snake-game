import type { GeneticTrainingConfig } from './types';

export function createDefaultGeneticTrainingConfig(inputSize: number): GeneticTrainingConfig {
  return {
    populationSize: 64,
    generations: 100,
    eliteCount: 4,
    tournamentSize: 4,
    crossoverRate: 0.75,
    mutationRate: 0.05,
    mutationSigma: 0.1,
    topology: [inputSize, 32, 16, 3],
    trainingSeeds: [101, 211, 307],
    validationSeeds: [401, 503, 601, 701, 809],
    validationEvery: 10,
    maxTicks: 10_000,
    level: 1,
    difficultyLevel: 1,
    gameMode: 'classic',
    scenarioWeights: { solo: 0.5, heuristic: 0.3, cohort: 0.2 },
    fitnessWeights: {
      score: 1,
      wins: 100,
      survival: 10,
      aliveAtLimit: 5,
      death: 5,
      cycle: 5,
    },
  };
}
