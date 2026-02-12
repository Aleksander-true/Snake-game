import { createEmptyBoard, inBounds } from '../src/engine/board';
import { isReverseDirection } from '../src/engine/collision';
import { createSnake, getTargetScore, getInitialRabbitCount } from '../src/engine/game';

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
    const snake = createSnake(1, 'Test', { x: 20, y: 20 }, 'right', false);
    expect(snake.segments.length).toBe(5);
    expect(snake.segments[0]).toEqual({ x: 20, y: 20 });
    expect(snake.alive).toBe(true);
    expect(snake.score).toBe(0);
  });

  test('getTargetScore computes correctly', () => {
    expect(getTargetScore(1)).toBe(11); // floor(1*1.2+10) = 11
    expect(getTargetScore(5)).toBe(16); // floor(5*1.2+10) = 16
  });

  test('getInitialRabbitCount computes correctly', () => {
    expect(getInitialRabbitCount(1, 5)).toBe(6); // floor(1.5 + 5) = 6
    expect(getInitialRabbitCount(2, 3)).toBe(10); // floor(3 + 7) = 10
  });
});
