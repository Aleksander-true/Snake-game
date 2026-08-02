import { runArenaSimulation } from '../src/arena';
import {
  calculateObservationInputSize,
  getTrainingLabAlgorithm,
  isTrainingLabPolicyId,
} from '../src/ai/nn/trainingLabPolicies';

describe('training lab policies', () => {
  test('recognizes policies and calculates the neural observation size', () => {
    expect(isTrainingLabPolicyId('random-turns')).toBe(true);
    expect(isTrainingLabPolicyId('neural-simple-v1')).toBe(true);
    expect(isTrainingLabPolicyId('unknown')).toBe(false);
    expect(calculateObservationInputSize(20)).toBe(402);
  });

  test('returns the selected ArenaAlgorithm implementation', () => {
    expect(getTrainingLabAlgorithm('random-turns').id).toBe('random-turns');
    expect(getTrainingLabAlgorithm('neural-simple-v1').id).toBe('neural-simple-v1');
  });

  test('runs the untrained neural policy deterministically in the headless Arena', () => {
    const run = () => runArenaSimulation({
      participants: [{ name: 'Тест', algorithm: getTrainingLabAlgorithm('neural-simple-v1') }],
      seed: 7,
      level: 1,
      difficultyLevel: 1,
      gameMode: 'classic',
      maxTicks: 2_000,
    });

    const first = run();
    const second = run();

    expect(first).toEqual(second);
    expect(first.ticksExecuted).toBeGreaterThan(0);
    expect(first.ticksExecuted).toBeLessThanOrEqual(2_000);
    expect(first.snakes[0].algorithmId).toBe('neural-simple-v1');
  });
});
