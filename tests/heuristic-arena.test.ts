import {
  wiseHeuristic,
  runArenaBatch,
  runArenaSimulation,
  Arena,
  calculateRunFitness,
  aggregateEvaluationMetrics,
} from '@snake-game/core';
import type { HeuristicAlgorithm } from '@snake-game/core';

const alwaysUpAlgorithm: HeuristicAlgorithm = {
  id: 'always-up',
  chooseDirection: (_state, _snake, _settings) => 'up',
};

describe('heuristic arena', () => {
  test.each(['limit', 'timeout', 'solo', 'win', 'dead', 'loss'] as const)(
    'awards half a win only for a surviving multiplayer draw: %s', outcome => {
      const arena = new Arena({
        seed: 42,
        participants: Array.from({ length: outcome === 'solo' ? 1 : 2 }, (_, i) => ({
          name: `Snake ${i}`, algorithm: alwaysUpAlgorithm,
        })),
      });
      const state = arena.getState();
      for (const snake of state.snakes) snake.movementPaused = true;
      if (outcome === 'timeout') state.levelTimeLeft = 0;
      if (outcome === 'win' || outcome === 'dead') state.snakes[1].die('test');
      if (outcome === 'dead' || outcome === 'loss') state.snakes[0].die('test');
      const result = arena.runOne(1);
      const stats = result.snakes[0];
      const draw = outcome === 'limit' || outcome === 'timeout';
      expect(stats.drawAtEnd).toBe(draw);
      const reachedTickLimit = outcome === 'limit' || outcome === 'solo';
      expect(stats.reachedTickLimit).toBe(reachedTickLimit);
      const weights = { score: 0, approach: 0, wins: 100, survival: 0, aliveAtLimit: 0, death: 0, cycle: 0 };
      expect(calculateRunFitness(stats, 1, weights)).toBe(draw ? 50 : outcome === 'win' ? 100 : 0);
      expect(calculateRunFitness(stats, 1, { ...weights, wins: 40 })).toBe(draw ? 20 : outcome === 'win' ? 40 : 0);
      const metrics = aggregateEvaluationMetrics([stats]);
      expect(metrics.winRate).toBe(outcome === 'win' ? 1 : 0);
      expect(metrics.drawRate).toBe(draw ? 1 : 0);
      expect(metrics.tickLimitRate).toBe(reachedTickLimit ? 1 : 0);
    },
  );
  test('runs a single deterministic headless simulation and returns metrics', () => {
    const result = runArenaSimulation({
      participants: [
        { name: 'Wise A', algorithm: wiseHeuristic },
        { name: 'Wise B', algorithm: wiseHeuristic },
      ],
      maxTicks: 50,
      seed: 42,
    });

    expect(result.seed).toBe(42);
    expect(result.ticksExecuted).toBeGreaterThan(0);
    expect(result.ticksExecuted).toBeLessThanOrEqual(50);
    expect(result.snakes).toHaveLength(2);
    expect(result.snakes[0].algorithmId).toBe('wise');
    expect(result.snakes[0].survivedMs).toBe(result.snakes[0].survivedTicks * 150);
    expect(result.snakes[0].foodApproachProgress).toBeGreaterThanOrEqual(0);
  });

  test('aggregates statistics by algorithm across multiple runs', () => {
    const result = runArenaBatch({
      participants: [
        { name: 'Wise', algorithm: wiseHeuristic },
        { name: 'Up', algorithm: alwaysUpAlgorithm },
      ],
      simulations: 4,
      maxTicks: 30,
      seedBase: 7,
    });

    expect(result.runs).toHaveLength(4);
    expect(result.summaryByAlgorithm['wise']).toBeDefined();
    expect(result.summaryByAlgorithm['always-up']).toBeDefined();
    expect(result.summaryByAlgorithm['always-up'].runs).toBe(4);
    expect(result.summaryByAlgorithm['wise'].avgSurvivedTicks).toBeGreaterThanOrEqual(0);
  });

});
