import {
  greedyBoardHeuristic,
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
        { name: 'Greedy A', algorithm: greedyBoardHeuristic },
        { name: 'Greedy B', algorithm: greedyBoardHeuristic },
      ],
      maxTicks: 50,
      seed: 42,
    });

    expect(result.seed).toBe(42);
    expect(result.ticksExecuted).toBeGreaterThan(0);
    expect(result.ticksExecuted).toBeLessThanOrEqual(50);
    expect(result.snakes).toHaveLength(2);
    expect(result.snakes[0].algorithmId).toBe('greedy-board-v1');
    expect(result.snakes[0].survivedMs).toBe(result.snakes[0].survivedTicks * 150);
  });

  test('aggregates statistics by algorithm across multiple runs', () => {
    const result = runArenaBatch({
      participants: [
        { name: 'Greedy', algorithm: greedyBoardHeuristic },
        { name: 'Up', algorithm: alwaysUpAlgorithm },
      ],
      simulations: 4,
      maxTicks: 30,
      seedBase: 7,
    });

    expect(result.runs).toHaveLength(4);
    expect(result.summaryByAlgorithm['greedy-board-v1']).toBeDefined();
    expect(result.summaryByAlgorithm['always-up']).toBeDefined();
    expect(result.summaryByAlgorithm['always-up'].runs).toBe(4);
    expect(result.summaryByAlgorithm['greedy-board-v1'].avgSurvivedTicks).toBeGreaterThanOrEqual(0);
  });
});

