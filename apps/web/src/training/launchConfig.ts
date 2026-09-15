import {
  calculateObservationInputSize,
  createDefaultGeneticTrainingConfig,
  createDefaultSettings,
} from '@snake-game/core';

export interface TrainingLaunchConfig {
  seed: number;
  level: number;
  difficultyLevel: number;
  maxTicks: number;
  gameMode: 'classic' | 'survival';
}

export function getDefaultTrainingLaunchConfig(): TrainingLaunchConfig {
  const settings = createDefaultSettings();
  const training = createDefaultGeneticTrainingConfig(
    calculateObservationInputSize(settings.visionSize),
  );
  return {
    seed: training.trainingSeeds[0],
    level: training.level,
    difficultyLevel: training.difficultyLevel,
    maxTicks: training.maxTicks,
    gameMode: training.gameMode,
  };
}
