import { Direction, Position, GameState, Snake } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { inBounds } from '../engine/board';
import { getFoodReward } from '../engine/systems/foodSystem';

const OPPONENT_SNAKE_DANGER_MULTIPLIER = 2;
const HEDGEHOG_DANGER_MULTIPLIER = 3;

/** Single-channel neural vision uses fixed obstacle values in the raw 100-point scale. */
export function generateSingleChannelVision(
  snake: Snake,
  state: GameState,
  settings: GameSettings,
): number[][] {
  const vision = generateVision(snake.head, snake.direction, state, settings);
  const size = vision.length;
  const center = Math.floor(size / 2);
  const obstacles = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const mark = (position: Position, value: number) => {
    const local = rotateToVision(position.x - snake.head.x, position.y - snake.head.y, snake.direction);
    const x = local.x + center;
    const y = local.y + center;
    if (x >= 0 && x < size && y >= 0 && y < size) {
      obstacles[y][x] = Math.min(obstacles[y][x], value);
    }
  };
  for (const wall of state.walls) mark(wall, -100);
  for (const other of state.snakes) {
    if (!other.alive) continue;
    other.segments.forEach((segment, index) => {
      const value = other.id === snake.id ? -100 : index === 0 ? -200 : index === 1 ? -160 : -120;
      mark(segment, value);
    });
  }
  for (const enemy of state.enemies) {
    const frontX = enemy.facing === 'left' ? enemy.pos.x : enemy.pos.x + enemy.width - 1;
    for (let y = enemy.pos.y; y < enemy.pos.y + enemy.height; y++) {
      for (let x = enemy.pos.x; x < enemy.pos.x + enemy.width; x++) {
        mark({ x, y }, x === frontX ? -160 : -120);
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const world = rotateToWorld(x - center, y - center, snake.direction, snake.head);
      if (!inBounds(world, state.width, state.height)) obstacles[y][x] = Math.min(obstacles[y][x], -100);
      // Food, including distant projections, must not cancel an occupied cell.
      if (obstacles[y][x] < 0) vision[y][x] = obstacles[y][x];
    }
  }
  return vision;
}

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

  const observerSnake = state.snakes.find(snake =>
    snake.alive && snake.head.x === headPos.x && snake.head.y === headPos.y
  );
  // Rebuild from the current state; tickCount alone does not track all mutations.
  const cellCount = state.width * state.height;
  const obstacles = new Uint8Array(cellCount);
  const snakeDanger = new Uint32Array(cellCount);
  const foodValues = new Float64Array(cellCount);
  const foodPresent = new Uint8Array(cellCount);
  for (const wall of state.walls) {
    if (inBounds(wall, state.width, state.height)) obstacles[wall.y * state.width + wall.x] |= 1;
  }
  for (const enemy of state.enemies) {
    for (let y = Math.max(0, enemy.pos.y); y < Math.min(state.height, enemy.pos.y + enemy.height); y++) {
      for (let x = Math.max(0, enemy.pos.x); x < Math.min(state.width, enemy.pos.x + enemy.width); x++) {
        obstacles[y * state.width + x] |= 2;
      }
    }
  }
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    const occupied = new Set<number>();
    const multiplier = snake === observerSnake ? 1 : OPPONENT_SNAKE_DANGER_MULTIPLIER;
    for (const segment of snake.segments) {
      if (!inBounds(segment, state.width, state.height)) continue;
      const index = segment.y * state.width + segment.x;
      if (occupied.has(index)) continue;
      occupied.add(index);
      snakeDanger[index] += multiplier;
    }
  }
  for (const food of state.foods) {
    if (!inBounds(food.pos, state.width, state.height)) continue;
    const index = food.pos.y * state.width + food.pos.x;
    // Match the previous find(): only the first food in an occupied cell is visible.
    if (foodPresent[index]) continue;
    foodPresent[index] = 1;
    foodValues[index] = getFoodReward(food, settings).points;
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
        const index = worldPos.y * state.width + worldPos.x;
        if (obstacles[index] & 1) {
          signal += getObstacleSignal(distance, settings);
        }
        if (obstacles[index] & 2) {
          signal += getObstacleSignal(distance, settings) * HEDGEHOG_DANGER_MULTIPLIER;
        }

        signal += getObstacleSignal(distance, settings) * snakeDanger[index];

        // Check food
        if (foodPresent[index] && !obstacles[index] && !snakeDanger[index]) {
          signal = 100 * foodValues[index];
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
  const visibleFood = new Set<number>();
  const projections = new Map<number, { maximum: number; evidence: number }>();
  for (const food of state.foods) {
    const relative = rotateToVision(food.pos.x - headPos.x, food.pos.y - headPos.y, direction);
    if (
      relative.x >= minOffset
      && relative.x <= maxOffset
      && relative.y >= minOffset
      && relative.y <= maxOffset
    ) {
      visibleFood.add((relative.y + half) * size + relative.x + half);
      continue;
    }
    const projected = projectToVisionEdge(relative, minOffset, maxOffset);
    const distance = Math.max(
      minOffset - relative.x, relative.x - maxOffset,
      minOffset - relative.y, relative.y - maxOffset,
    );
    const foodValue = getFoodReward(food, settings).points;
    if (foodValue <= 0) continue;
    const index = (projected.y + half) * size + projected.x + half;
    const projection = projections.get(index) ?? { maximum: 0, evidence: 0 };
    projection.maximum = Math.max(projection.maximum, foodValue);
    projection.evidence += foodValue / distance;
    projections.set(index, projection);
  }
  for (const [index, { maximum, evidence }] of projections) {
    const y = Math.floor(index / size);
    const x = index % size;
    // Direct observations take priority over projected food.
    if (visibleFood.has(index) || vision[y][x] < 0) continue;
    const floor = Math.min(0.05, maximum);
    // Apply the floor once per cell, so a receding group also tends to 0.05.
    const signal = floor + (maximum - floor) * (evidence / (maximum + evidence));
    vision[y][x] = 100 * signal;
  }
}

export function rotateToVision(worldX: number, worldY: number, direction: Direction): Position {
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
