import { Position, Snake, GameState } from './types';
import { inBounds } from './board';

/**
 * Check if a position collides with a wall.
 */
export function collidesWithWall(pos: Position, state: GameState): boolean {
  if (!inBounds(pos, state.width, state.height)) return true; // out of bounds = wall
  return state.walls.some(w => w.x === pos.x && w.y === pos.y);
}

/**
 * Check if a position collides with any snake segment.
 * Optionally exclude a specific snake (by id) head position.
 */
export function collidesWithSnake(
  pos: Position,
  snakes: Snake[],
  excludeSnakeId?: number,
  excludeHead?: boolean
): boolean {
  for (const snake of snakes) {
    if (!snake.alive) continue;
    const segments = excludeHead && snake.id === excludeSnakeId
      ? snake.segments.slice(1)
      : snake.segments;
    if (segments.some(seg => seg.x === pos.x && seg.y === pos.y)) {
      return true;
    }
  }
  return false;
}

/**
 * Check self-collision: does the head overlap any other segment of the same snake?
 */
export function selfCollision(snake: Snake): boolean {
  const head = snake.segments[0];
  return snake.segments.slice(1).some(seg => seg.x === head.x && seg.y === head.y);
}

/**
 * Check if a direction reversal is attempted (180° turn).
 */
export function isReverseDirection(
  current: 'up' | 'down' | 'left' | 'right',
  next: 'up' | 'down' | 'left' | 'right'
): boolean {
  const opposites: Record<string, string> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  };
  return opposites[current] === next;
}
