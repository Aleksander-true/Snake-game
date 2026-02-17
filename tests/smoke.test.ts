import { createEmptyBoard, inBounds } from '../src/engine/board';
import { isReverseDirection } from '../src/engine/collision';
import { GameEngine } from '../src/engine/GameEngine';
import { getTargetScore, getCumulativeTargetScore, getInitialRabbitCount } from '../src/engine/formulas';
import { EngineContext } from '../src/engine/context';
import { RandomPort } from '../src/engine/ports';
import { createDefaultSettings } from '../src/engine/settings';

/** Deterministic RNG for tests — always returns 0.5 / floor(0.5 * max). */
const testRng: RandomPort = {
  next: () => 0.5,
  nextInt: (max: number) => Math.floor(0.5 * max),
};

/** Default test context with standard settings and deterministic RNG. */
const testCtx: EngineContext = {
  settings: createDefaultSettings(),
  rng: testRng,
};

const testEngine = new GameEngine(testCtx);

describe('Smoke tests — project skeleton', () => {
  test('createEmptyBoard creates correct dimensions', () => {
    const board = createEmptyBoard(10, 8);
    expect(board.length).toBe(8);
    expect(board[0].length).toBe(10);
    expect(board[0][0]).toBe(' ');
  });

  test('inBounds checks correctly', () => {
    expect(inBounds({ x: 0, y: 0 }, 10, 10)).toBe(true);
    expect(inBounds({ x: 9, y: 9 }, 10, 10)).toBe(true);
    expect(inBounds({ x: -1, y: 0 }, 10, 10)).toBe(false);
    expect(inBounds({ x: 10, y: 0 }, 10, 10)).toBe(false);
  });

  test('isReverseDirection detects opposite directions', () => {
    expect(isReverseDirection('up', 'down')).toBe(true);
    expect(isReverseDirection('left', 'right')).toBe(true);
    expect(isReverseDirection('up', 'left')).toBe(false);
    expect(isReverseDirection('up', 'up')).toBe(false);
  });

  test('createSnake creates snake with correct length', () => {
    const snake = testEngine.createSnake(1, 'Test', { x: 20, y: 20 }, 'right', false);
    expect(snake.segments.length).toBe(testCtx.settings.initialSnakeLength);
    expect(snake.segments[0]).toEqual({ x: 20, y: 20 });
    expect(snake.alive).toBe(true);
    expect(snake.score).toBe(0);
  });

  test('getTargetScore computes correctly', () => {
    const settings = testCtx.settings;
    expect(getTargetScore(1, settings)).toBe(Math.floor(settings.targetScoreCoeff * 1 + settings.targetScoreBase));
    expect(getTargetScore(5, settings)).toBe(Math.floor(settings.targetScoreCoeff * 5 + settings.targetScoreBase));
  });

  test('getCumulativeTargetScore sums level targets', () => {
    const settings = testCtx.settings;
    const level1Target = getTargetScore(1, settings);
    const level2Target = getTargetScore(2, settings);
    const level3Target = getTargetScore(3, settings);
    expect(getCumulativeTargetScore(1, settings)).toBe(level1Target);
    expect(getCumulativeTargetScore(2, settings)).toBe(level1Target + level2Target);
    expect(getCumulativeTargetScore(3, settings)).toBe(level1Target + level2Target + level3Target);
  });

  test('getInitialRabbitCount computes correctly', () => {
    const settings = testCtx.settings;
    const expected1 = Math.floor(settings.rabbitCountPerSnakeCoeff * 1 + (settings.rabbitCountBase - 5));
    const expected2 = Math.floor(settings.rabbitCountPerSnakeCoeff * 2 + (settings.rabbitCountBase - 3));
    expect(getInitialRabbitCount(1, 5, settings)).toBe(expected1);
    expect(getInitialRabbitCount(2, 3, settings)).toBe(expected2);
  });
});
