import { Direction, Position, GameState } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { inBounds } from '../engine/board';

/**
 * Generate the vision matrix for a bot snake.
 * The matrix is rotated so the snake's heading points "up" (toward row 0).
 */
export function generateVision(
  headPos: Position,
  direction: Direction,
  state: GameState,
  settings: GameSettings,
  size: number = settings.visionSize
): number[][] {
  const half = Math.floor(size / 2);
  const vision: number[][] = [];

  for (let visionY = 0; visionY < size; visionY++) {
    vision.push(new Array(size).fill(0));
  }

  // Map vision coordinates to world coordinates based on direction
  for (let visionY = 0; visionY < size; visionY++) {
    for (let visionX = 0; visionX < size; visionX++) {
      // Vision-relative offset (center is head)
      const relX = visionX - half;
      const relY = visionY - half;

      // Rotate to world coordinates based on heading
      const worldPos = rotateToWorld(relX, relY, direction, headPos);

      // Calculate signals
      let signal = 0;
      const distance = Math.max(Math.abs(relX), Math.abs(relY));

      if (!inBounds(worldPos, state.width, state.height)) {
        // Out of bounds = wall
        signal += getObstacleSignal(distance, settings);
      } else {
        // Check walls
        if (state.walls.some(wall => wall.x === worldPos.x && wall.y === worldPos.y)) {
          signal += getObstacleSignal(distance, settings);
        }

        // Check snake bodies
        for (const snake of state.snakes) {
          if (!snake.alive) continue;
          if (snake.segments.some(segment => segment.x === worldPos.x && segment.y === worldPos.y)) {
            signal += getObstacleSignal(distance, settings);
          }
        }

        // Check rabbits
        if (state.rabbits.some(rabbit => rabbit.pos.x === worldPos.x && rabbit.pos.y === worldPos.y)) {
          signal += getRabbitSignal(distance, settings);
        }
      }

      vision[visionY][visionX] = signal;
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

function getObstacleSignal(dist: number, settings: GameSettings): number {
  if (dist <= 0) return settings.obstacleSignalClose;
  const signal = settings.obstacleSignalClose + settings.obstacleSignalDecay * dist;
  return Math.min(signal, -5); // cap at -5
}

function getRabbitSignal(dist: number, settings: GameSettings): number {
  if (dist <= 0) return settings.rabbitSignalClose;
  const signal = settings.rabbitSignalClose - settings.rabbitSignalDecay * dist;
  return Math.max(signal, settings.rabbitSignalMin);
}

/**
 * Rotate a matrix 90° clockwise.
 */
export function rotateMatrix90CW<T>(matrix: T[][]): T[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: T[][] = [];

  for (let colIndex = 0; colIndex < cols; colIndex++) {
    const newRow: T[] = [];
    for (let rowIndex = rows - 1; rowIndex >= 0; rowIndex--) {
      newRow.push(matrix[rowIndex][colIndex]);
    }
    result.push(newRow);
  }

  return result;
}
