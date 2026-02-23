import { GameSettings } from './settings';

/**
 * Formula: floor(targetScoreCoeff * level + targetScoreBase)
 */
export function getTargetScore(level: number, settings: GameSettings): number {
  return Math.floor(settings.targetScoreCoeff * level + settings.targetScoreBase);
}

/**
 * Cumulative target score from level 1 to current level.
 */
export function getCumulativeTargetScore(level: number, settings: GameSettings): number {
  let total = 0;
  for (let levelNumber = 1; levelNumber <= level; levelNumber++) {
    total += getTargetScore(levelNumber, settings);
  }
  return total;
}

/**
 * Formula: floor(wallClusterCoeff * level + wallClusterBase)
 */
export function getWallClusterCount(level: number, settings: GameSettings): number {
  return Math.floor(settings.wallClusterCoeff * level + settings.wallClusterBase);
}

/**
 * Formula: floor(wallLengthCoeff * difficulty + wallLengthBase)
 */
export function getWallLength(difficultyLevel: number, settings: GameSettings): number {
  return Math.floor(settings.wallLengthCoeff * difficultyLevel + settings.wallLengthBase);
}

/**
 * Formula: floor(foodCountPerSnakeCoeff * snakeCount + foodCountBase - difficultyLevel)
 */
export function getInitialFoodCount(
  snakeCount: number,
  difficultyLevel: number,
  settings: GameSettings
): number {
  return Math.floor(settings.foodCountPerSnakeCoeff * snakeCount + (settings.foodCountBase - difficultyLevel));
}

// Backward-compatible alias for older tests/modules.
export const getInitialRabbitCount = getInitialFoodCount;
