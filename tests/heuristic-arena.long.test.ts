import {
  getHeuristicAlgorithmById,
  runArenaBatch,
  wiseHeuristic,
} from '../src/heuristic';

describe('heuristic arena (long)', () => {
  test('wise algorithm can reach 100 score without dying in at least one deterministic endurance run', () => {
    const result = runArenaBatch({
      participants: [{ name: 'Wise Solo', algorithm: wiseHeuristic }],
      simulations: 4,
      seedBase: 31,
      maxTicks: 1200,
      settings: {
        targetScoreCoeff: 0,
        targetScoreBase: 1000000,
        wallClusterCoeff: 0,
        wallClusterBase: 0,
        wallLengthCoeff: 0,
        wallLengthBase: 0,
        foodCountPerSnakeCoeff: 4,
        foodCountBase: 28,
        hungerThreshold: 28,
        baseWidth: 42,
        baseHeight: 42,
        levelSizeIncrement: 0,
        foodYoungAge: 0,
        foodAdultAge: 999999,
        foodMaxAge: 999999,
        initialSnakeLength: 2,
        minSnakeLength: 1,
      },
    });

    const hasSuccessfulRun = result.runs.some(run => {
      const snake = run.snakes[0];
      return snake.aliveAtEnd && snake.score >= 100;
    });
    expect(hasSuccessfulRun).toBe(true);
  });

  test('tiered algorithms show statistical ordering by score (wise/solid outperform rookie/basic)', () => {
    const settings = {
      targetScoreCoeff: 0,
      targetScoreBase: 1000000,
      wallClusterCoeff: 1.4,
      wallClusterBase: 2,
      wallLengthCoeff: 1.2,
      wallLengthBase: 4,
      foodCountPerSnakeCoeff: 2.4,
      foodCountBase: 9,
      hungerThreshold: 16,
      baseWidth: 34,
      baseHeight: 34,
    };
    const result = runArenaBatch({
      participants: [
        { name: 'Wise', algorithm: wiseHeuristic },
        { name: 'Solid', algorithm: getHeuristicAlgorithmById('solid') },
        { name: 'Basic', algorithm: getHeuristicAlgorithmById('basic') },
        { name: 'Rookie', algorithm: getHeuristicAlgorithmById('rookie') },
      ],
      simulations: 8,
      maxTicks: 600,
      seedBase: 200,
      settings,
    });

    const rookie = result.summaryByAlgorithm['rookie'];
    const basic = result.summaryByAlgorithm['basic'];
    const solid = result.summaryByAlgorithm['solid'];
    const wise = result.summaryByAlgorithm['wise'];

    expect(wise.avgScore).toBeGreaterThan(rookie.avgScore);
    expect(solid.avgScore).toBeGreaterThan(rookie.avgScore);
    expect(wise.avgScore).toBeGreaterThan(basic.avgScore);
    expect(wise.avgSurvivedTicks).toBeGreaterThanOrEqual(basic.avgSurvivedTicks);
  });

  test('stress run with 4 bots keeps arena metrics consistent', () => {
    const result = runArenaBatch({
      participants: [
        { name: 'Wise', algorithm: wiseHeuristic },
        { name: 'Solid', algorithm: getHeuristicAlgorithmById('solid') },
        { name: 'Basic', algorithm: getHeuristicAlgorithmById('basic') },
        { name: 'Rookie', algorithm: getHeuristicAlgorithmById('rookie') },
      ],
      simulations: 5,
      maxTicks: 1200,
      seedBase: 500,
    });

    expect(result.runs).toHaveLength(5);
    for (const run of result.runs) {
      expect(run.snakes).toHaveLength(4);
      expect(run.ticksExecuted).toBeGreaterThan(0);
      expect(run.ticksExecuted).toBeLessThanOrEqual(1200);

      for (const snake of run.snakes) {
        expect(snake.score).toBeGreaterThanOrEqual(0);
        expect(snake.survivedTicks).toBeGreaterThanOrEqual(0);
        expect(snake.survivedTicks).toBeLessThanOrEqual(run.ticksExecuted);
      }
    }
  });
});

