import defaults from '../gameDefaults.json';
import type { GeneticTrainingConfig } from './types';

export function createDefaultGeneticTrainingConfig(
  inputSize: number,
  seed = defaults.training.seed,
): GeneticTrainingConfig {
  const training = defaults.training;
  return {
    populationSize: training.populationSize,
    generations: training.generations,
    eliteCount: training.eliteCount,
    tournamentSize: training.tournamentSize,
    crossoverRate: training.crossoverRate,
    mutationRate: training.mutationRate,
    mutationSigma: training.mutationSigma,
    topology: [inputSize, ...training.hiddenLayers, 3],
    trainingSeedStrategy: training.seedStrategy as GeneticTrainingConfig['trainingSeedStrategy'],
    trainingSeeds: training.trainingSeedOffsets.map((offset) => seed + offset),
    validationSeeds: training.validationSeedOffsets.map((offset) => seed + offset),
    validationEvery: training.validationEvery,
    maxTicks: training.maxTicks,
    level: training.level,
    difficultyLevel: training.difficultyLevel,
    gameMode: training.gameMode as GeneticTrainingConfig['gameMode'],
    scenarioWeights: { ...training.scenarioWeights },
    fitnessWeights: { ...training.fitnessWeights },
  };
}
