import { isObservationVersion, type ObservationVersion } from '../ai/encodeObservation';
import defaults from '../gameDefaults.json';
import type {
  GeneticTrainingConfig,
  GeneticTrainingPreset,
  TrainingScenarioGames,
  TrainingHeuristicId,
  TrainingScenarioWeights,
} from './types';

/** Resolve old configurations and reject unsupported opponent IDs before evaluation. */
export function resolveTrainingHeuristic(value: unknown): TrainingHeuristicId {
  if (value === undefined) return 'rookie';
  if (value === 'rookie' || value === 'basic' || value === 'solid' || value === 'wise') return value;
  throw new Error('Unsupported training heuristic opponent');
}

export function createDefaultGeneticTrainingConfig(
  inputSize: number,
  seed = defaults.training.seed,
  observationVersion: ObservationVersion = 3,
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
    visionSize: inferTrainingVisionSize(inputSize, observationVersion),
    observationVersion,
    trainingSeedStrategy: training.seedStrategy as GeneticTrainingConfig['trainingSeedStrategy'],
    trainingSeeds: training.trainingSeedOffsets.map((offset) => seed + offset),
    validationSeeds: training.validationSeedOffsets.map((offset) => seed + offset),
    validationEvery: training.validationEvery,
    maxTicks: training.maxTicks,
    level: training.level,
    difficultyLevel: training.difficultyLevel,
    gameMode: training.gameMode as GeneticTrainingConfig['gameMode'],
    heuristicOpponent: 'rookie',
    scenarioGames: { ...training.scenarioGames },
    fitnessWeights: { ...training.fitnessWeights },
  };
}

function inferTrainingVisionSize(inputSize: number, observationVersion: ObservationVersion): number {
  void observationVersion;
  const visionSide = Math.sqrt(inputSize - 5);
  if (Number.isInteger(visionSide) && visionSide > 0) return visionSide;
  return defaults.ai.visionSize;
}

/** Validate persisted observation metadata without guessing its version from the genome. */
export function isTrainingObservationConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<GeneticTrainingConfig>;
  const size = config.visionSize;
  const version = config.observationVersion;
  return isObservationVersion(version)
    && typeof size === 'number' && Number.isInteger(size) && size >= 3 && size <= 64
    && Array.isArray(config.topology)
    && config.topology.length >= 2
    && config.topology.every(layer => Number.isInteger(layer) && layer > 0)
    && config.topology[config.topology.length - 1] === 3
    && config.topology[0] === size * size + 5;
}

export function createBuiltInGeneticTrainingPresets(
  inputSize: number,
  seed = defaults.training.seed,
  observationVersion: ObservationVersion = 3,
): GeneticTrainingPreset[] {
  const base = createDefaultGeneticTrainingConfig(inputSize, seed, observationVersion);
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
