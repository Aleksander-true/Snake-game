import type { ArenaSnakeStats } from '../arena';
import type { FitnessWeights, TrainingEvaluationMetrics } from './types';

export function calculateRunFitness(
  stats: ArenaSnakeStats,
  maxTicks: number,
  weights: FitnessWeights,
): number {
  const survival = Math.min(1, stats.survivedTicks / Math.max(1, maxTicks));
  const drawReward = stats.drawAtEnd && stats.aliveAtEnd && stats.levelsWon === 0
    ? 0.5 * weights.wins : 0;
  return stats.score * weights.score
    + stats.foodApproachProgress * (weights.approach ?? 0)
    + stats.levelsWon * weights.wins
    + drawReward
    + survival * weights.survival
    + (stats.aliveAtEnd ? weights.aliveAtLimit : -weights.death);
}

export function aggregateEvaluationMetrics(
  stats: ArenaSnakeStats[],
): TrainingEvaluationMetrics {
  if (stats.length === 0) {
    return {
      runs: 0,
      averageScore: 0,
      averageFoodEaten: 0,
      averageFoodApproach: 0,
      averageSurvivedTicks: 0,
      averageFinalLength: 0,
      winRate: 0,
      drawRate: 0,
      tickLimitRate: 0,
      aliveRate: 0,
      deathReasons: {},
    };
  }
  const deathReasons: Record<string, number> = {};
  for (const item of stats) {
    if (item.deathReason) deathReasons[item.deathReason] = (deathReasons[item.deathReason] ?? 0) + 1;
  }
  const sum = (select: (item: ArenaSnakeStats) => number) =>
    stats.reduce((total, item) => total + select(item), 0) / stats.length;
  return {
    runs: stats.length,
    averageScore: sum((item) => item.score),
    averageFoodEaten: sum((item) => item.foodEaten),
    averageFoodApproach: sum((item) => item.foodApproachProgress),
    averageSurvivedTicks: sum((item) => item.survivedTicks),
    averageFinalLength: sum((item) => item.finalLength),
    winRate: sum((item) => item.levelsWon > 0 ? 1 : 0),
    drawRate: sum((item) => item.drawAtEnd ? 1 : 0),
    tickLimitRate: sum((item) => item.reachedTickLimit ? 1 : 0),
    aliveRate: sum((item) => item.aliveAtEnd ? 1 : 0),
    deathReasons,
  };
}
