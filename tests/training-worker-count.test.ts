import { resolveTrainingWorkerCount } from '../apps/web/src/training/trainingWorkerSelection';

describe('training worker selection', () => {
  test('reserves two cores automatically and one core in manual mode', () => {
    expect(resolveTrainingWorkerCount('automatic', 1, 12)).toBe(10);
    expect(resolveTrainingWorkerCount('manual', 20, 12)).toBe(11);
    expect(resolveTrainingWorkerCount('manual', 6, 12)).toBe(6);
  });

  test('keeps at least one worker when hardware information is small or missing', () => {
    expect(resolveTrainingWorkerCount('automatic', 1, 2)).toBe(1);
    expect(resolveTrainingWorkerCount('automatic', 1, 0)).toBe(1);
  });
});
