import { Direction, Position, GameState } from '../engine/types';
import { gameSettings } from '../engine/settings';
import { inBounds } from '../engine/board';

/**
 * Generate the vision matrix for a bot snake.
 * The matrix is rotated so the snake's heading points "up" (toward row 0).
 */
export function generateVision(
  headPos: Position,
  direction: Direction,
  state: GameState,
  size: number = gameSettings.visionSize
): number[][] {
  const half = Math.floor(size / 2);
  const vision: number[][] = [];

  for (let vy = 0; vy < size; vy++) {
    vision.push(new Array(size).fill(0));
  }

  // Map vision coordinates to world coordinates based on direction
  for (let vy = 0; vy < size; vy++) {
    for (let vx = 0; vx < size; vx++) {
      // Vision-relative offset (center is head)
      const relX = vx - half;
      const relY = vy - half;

      // Rotate to world coordinates based on heading
      const worldPos = rotateToWorld(relX, relY, direction, headPos);

      // Calculate signals
      let signal = 0;
      const dist = Math.max(Math.abs(relX), Math.abs(relY));

      if (!inBounds(worldPos, state.width, state.height)) {
        // Out of bounds = wall
        signal += getObstacleSignal(dist);
      } else {
        // Check walls
        if (state.walls.some(w => w.x === worldPos.x && w.y === worldPos.y)) {
          signal += getObstacleSignal(dist);
        }

        // Check snake bodies
        for (const snake of state.snakes) {
          if (!snake.alive) continue;
          if (snake.segments.some(s => s.x === worldPos.x && s.y === worldPos.y)) {
            signal += getObstacleSignal(dist);
          }
        }

        // Check rabbits
        if (state.rabbits.some(r => r.pos.x === worldPos.x && r.pos.y === worldPos.y)) {
          signal += getRabbitSignal(dist);
        }
      }

      vision[vy][vx] = signal;
    }
  }

  return vision;
}

/**
 * Rotate vision-relative coordinates to world coordinates.
 */
export function rotateToWorld(
  relX: number,
  relY: number,
  direction: Direction,
  headPos: Position
): Position {
  switch (direction) {
    case 'up':
      return { x: headPos.x + relX, y: headPos.y + relY };
    case 'down':
      return { x: headPos.x - relX, y: headPos.y - relY };
    case 'left':
      return { x: headPos.x + relY, y: headPos.y - relX };
    case 'right':
      return { x: headPos.x - relY, y: headPos.y + relX };
  }
}

function getObstacleSignal(dist: number): number {
  if (dist <= 0) return gameSettings.obstacleSignalClose;
  const signal = gameSettings.obstacleSignalClose + gameSettings.obstacleSignalDecay * dist;
  return Math.min(signal, -5); // cap at -5
}

function getRabbitSignal(dist: number): number {
  if (dist <= 0) return gameSettings.rabbitSignalClose;
  const signal = gameSettings.rabbitSignalClose - gameSettings.rabbitSignalDecay * dist;
  return Math.max(signal, gameSettings.rabbitSignalMin);
}

/**
 * Rotate a matrix 90° clockwise.
 */
export function rotateMatrix90CW<T>(matrix: T[][]): T[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: T[][] = [];

  for (let c = 0; c < cols; c++) {
    const newRow: T[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      newRow.push(matrix[r][c]);
    }
    result.push(newRow);
  }

  return result;
}
