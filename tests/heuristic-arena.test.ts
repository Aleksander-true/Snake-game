import {
  wiseHeuristic,
  HeuristicAlgorithm,
  runArenaBatch,
  runArenaSimulation,
} from '../src/heuristic';

const alwaysUpAlgorithm: HeuristicAlgorithm = {
  id: 'always-up',
  chooseDirection: (_state, _snake, _settings) => 'up',
};

describe('heuristic arena', () => {
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

