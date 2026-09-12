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

  if (size === 0) return vision;

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
        if (state.enemies.some(enemy =>
          worldPos.x >= enemy.pos.x
          && worldPos.x < enemy.pos.x + enemy.width
          && worldPos.y >= enemy.pos.y
          && worldPos.y < enemy.pos.y + enemy.height
        )) {
          signal += getObstacleSignal(distance, settings);
        }

        // Check snake bodies
        for (const snake of state.snakes) {
          if (!snake.alive) continue;
          if (snake.segments.some(segment => segment.x === worldPos.x && segment.y === worldPos.y)) {
            signal += getObstacleSignal(distance, settings);
          }
        }

        // Check food
        if (state.foods.some(food => food.pos.x === worldPos.x && food.pos.y === worldPos.y)) {
          signal += getFoodSignal(distance, settings);
        }
      }

      vision[visionY][visionX] = signal;
    }
  }

  addOffscreenFoodSignals(vision, headPos, direction, state, settings, half);

  return vision;
}

function addOffscreenFoodSignals(
  vision: number[][],
  headPos: Position,
  direction: Direction,
  state: GameState,
  settings: GameSettings,
  half: number,
): void {
  const size = vision.length;
  const minOffset = -half;
  const maxOffset = size - half - 1;
  for (const food of state.foods) {
    const relative = rotateToVision(food.pos.x - headPos.x, food.pos.y - headPos.y, direction);
    if (
      relative.x >= minOffset
      && relative.x <= maxOffset
      && relative.y >= minOffset
      && relative.y <= maxOffset
    ) continue;
    const projected = projectToVisionEdge(relative, minOffset, maxOffset);
    const distance = Math.max(Math.abs(relative.x), Math.abs(relative.y));
    vision[projected.y + half][projected.x + half] += getFoodSignal(distance, settings);
  }
}

function rotateToVision(worldX: number, worldY: number, direction: Direction): Position {
  switch (direction) {
    case 'up':
      return { x: worldX, y: worldY };
    case 'down':
      return { x: -worldX, y: -worldY };
    case 'left':
      return { x: -worldY, y: worldX };
    case 'right':
      return { x: worldY, y: -worldX };
  }
}

function projectToVisionEdge(
  relative: Position,
  minOffset: number,
  maxOffset: number,
): Position {
  const scales: number[] = [];
  if (relative.x < minOffset) scales.push(minOffset / relative.x);
  if (relative.x > maxOffset) scales.push(maxOffset / relative.x);
  if (relative.y < minOffset) scales.push(minOffset / relative.y);
  if (relative.y > maxOffset) scales.push(maxOffset / relative.y);
  const scale = Math.min(...scales);
  return {
    x: Math.max(minOffset, Math.min(maxOffset, Math.round(relative.x * scale))),
    y: Math.max(minOffset, Math.min(maxOffset, Math.round(relative.y * scale))),
  };
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
  if (dist <= 1) return settings.obstacleSignalClose;
  const signal = settings.obstacleSignalClose + settings.obstacleSignalDecay * (dist - 1);
  return Math.min(signal, -5); // cap at -5
}

function getFoodSignal(dist: number, settings: GameSettings): number {
  if (dist <= 1) return settings.foodSignalClose;
  const signal = settings.foodSignalClose - settings.foodSignalDecay * (dist - 1);
  const minimum = Math.max(settings.foodSignalMin, settings.foodSignalClose * 0.05);
  return Math.max(signal, minimum);
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
