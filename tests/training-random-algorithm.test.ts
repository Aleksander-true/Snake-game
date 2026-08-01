import { runArenaSimulation } from '../src/arena';
import { randomArenaAlgorithm } from '../src/ai/ai_algorithm';

describe('training lab baseline algorithm', () => {
  test('random-turns completes a headless arena run with one bot', () => {
    const result = runArenaSimulation({
      participants: [{ name: 'Тест', algorithm: randomArenaAlgorithm }],
      seed: 7,
      level: 1,
      difficultyLevel: 1,
      gameMode: 'classic',
      maxTicks: 2000,
    });

    expect(result.ticksExecuted).toBeGreaterThan(0);
    expect(result.ticksExecuted).toBeLessThanOrEqual(2000);
    expect(result.snakes).toHaveLength(1);
    expect(result.snakes[0].algorithmId).toBe('random-turns');
  });

  test('random-turns produces identical metrics for the same arena seed', () => {
    const run = () => runArenaSimulation({
      participants: [{ name: 'Тест', algorithm: randomArenaAlgorithm }],
      seed: 19,
      level: 1,
      difficultyLevel: 1,
      gameMode: 'classic',
      maxTicks: 500,
    });

    expect(run()).toEqual(run());
  });
});
