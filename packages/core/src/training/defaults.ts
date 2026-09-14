import defaults from '../gameDefaults.json';
import type {
  GeneticTrainingConfig,
  GeneticTrainingPreset,
  TrainingScenarioGames,
  TrainingScenarioWeights,
} from './types';

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
    scenarioGames: { ...training.scenarioGames },
    fitnessWeights: { ...training.fitnessWeights },
  };
}

export function createBuiltInGeneticTrainingPresets(
  inputSize: number,
  seed = defaults.training.seed,
): GeneticTrainingPreset[] {
  const base = createDefaultGeneticTrainingConfig(inputSize, seed);
  return defaults.training.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    config: {
      ...base,
      populationSize: preset.populationSize,
      eliteCount: preset.eliteCount,
      tournamentSize: preset.tournamentSize,
      topology: [inputSize, ...preset.hiddenLayers, 3],
      crossoverRate: preset.crossoverRate,
      mutationRate: preset.mutationRate,
      mutationSigma: preset.mutationSigma,
      maxTicks: preset.maxTicks,
      scenarioGames: { ...preset.scenarioGames },
      fitnessWeights: { ...preset.fitnessWeights },
    },
  }));
}

export function resolveTrainingScenarioGames(config: {
  scenarioGames?: TrainingScenarioGames;
  scenarioWeights?: TrainingScenarioWeights;
  trainingSeeds: number[];
}): TrainingScenarioGames {
  if (config.scenarioGames) return { ...config.scenarioGames };
  const weights = config.scenarioWeights ?? { solo: 1, heuristic: 0, cohort: 0 };
  const entries = Object.entries(weights) as Array<[keyof TrainingScenarioGames, number]>;
  const active = entries.filter(([, value]) => value > 0);
  const totalWeight = active.reduce((sum, [, value]) => sum + value, 0);
  if (totalWeight <= 0) return { solo: 1, heuristic: 0, cohort: 0 };
  const targetGames = Math.max(active.length, config.trainingSeeds.length * active.length);
  const games: TrainingScenarioGames = { solo: 0, heuristic: 0, cohort: 0 };
  const remainingGames = targetGames - active.length;
  const allocations = active.map(([scenario, weight]) => {
    const exact = weight / totalWeight * remainingGames;
    const count = Math.floor(exact);
    games[scenario] = 1 + count;
    return { scenario, remainder: exact - count };
  });
  let allocated = Object.values(games).reduce((sum, value) => sum + value, 0);
  allocations.sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; allocated < targetGames; index++, allocated++) {
    games[allocations[index % allocations.length].scenario]++;
  }
  return games;
}
