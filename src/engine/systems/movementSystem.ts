import { Snake, Direction, Position } from '../types';
import { isReverseDirection } from '../collision';

/**
 * Get the next head position given current head and direction.
 */
export function getNextHeadPosition(head: Position, direction: Direction): Position {
  switch (direction) {
    case 'up':    return { x: head.x, y: head.y - 1 };
    case 'down':  return { x: head.x, y: head.y + 1 };
    case 'left':  return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

/**
 * Apply a direction change to a snake, blocking 180° reversals.
 */
export function applyDirection(snake: Snake, newDirection: Direction): void {
  if (!isReverseDirection(snake.direction, newDirection)) {
    snake.direction = newDirection;
  }
}

/**
 * Move the snake forward: add new head, remove tail (unless growing).
 */
export function moveSnake(snake: Snake, grow: boolean): void {
  const newHead = getNextHeadPosition(snake.segments[0], snake.direction);
  snake.segments.unshift(newHead);
  if (!grow) {
    snake.segments.pop();
  }
}
