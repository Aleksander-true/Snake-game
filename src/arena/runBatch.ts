import { Arena } from './Arena';
import type {
  ArenaBatchConfig,
  ArenaBatchResult,
  ArenaRunConfig,
  ArenaRunResult,
} from './types';

/** Runs a single headless simulation until death, level complete, or maxTicks. */
export function runArenaSimulation(config: ArenaRunConfig): ArenaRunResult {
  const arena = new Arena({
    participants: config.participants,
    level: config.level,
    difficultyLevel: config.difficultyLevel,
    gameMode: config.gameMode,
    seed: config.seed,
    settings: config.settings,
  });
  return arena.runOne(config.maxTicks);
}

function aggregateByAlgorithm(
  runs: ArenaRunResult[]
): ArenaBatchResult['summaryByAlgorithm'] {
  const aggregate: Record<
    string,
    { runs: number; score: number; survivedTicks: number; survivedMs: number }
  > = {};

  for (const run of runs) {
    for (const snake of run.snakes) {
      if (!aggregate[snake.algorithmId]) {
        aggregate[snake.algorithmId] = {
          runs: 0,
          score: 0,
          survivedTicks: 0,
          survivedMs: 0,
        };
      }
      aggregate[snake.algorithmId].runs++;
      aggregate[snake.algorithmId].score += snake.score;
      aggregate[snake.algorithmId].survivedTicks += snake.survivedTicks;
      aggregate[snake.algorithmId].survivedMs += snake.survivedMs;
    }
  }

  const summary: ArenaBatchResult['summaryByAlgorithm'] = {};
  for (const [algorithmId, data] of Object.entries(aggregate)) {
    summary[algorithmId] = {
      runs: data.runs,
      avgScore: data.score / data.runs,
      avgSurvivedTicks: data.survivedTicks / data.runs,
      avgSurvivedMs: data.survivedMs / data.runs,
    };
  }
  return summary;
}

/** Runs multiple arena simulations with different seeds and aggregates fitness. */
export function runArenaBatch(config: ArenaBatchConfig): ArenaBatchResult {
  const simulations = Math.max(1, config.simulations);
  const seedBase = config.seedBase ?? 1;
  const runs: ArenaRunResult[] = [];

  for (let i = 0; i < simulations; i++) {
    const arena = new Arena({
      ...config,
      seed: seedBase + i,
    });
    runs.push(arena.runOne(config.maxTicks));
  }

  return {
    runs,
    summaryByAlgorithm: aggregateByAlgorithm(runs),
  };
}
