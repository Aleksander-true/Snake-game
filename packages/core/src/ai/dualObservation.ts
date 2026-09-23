import type { BotInput, Direction, GameState, Position, Snake } from '../engine/types';
import type { GameSettings } from '../engine/settings';
import { inBounds } from '../engine/board';
import { getFoodReward } from '../engine/systems/foodSystem';
import { canOccupy, enemyOccupiesPosition, getEnemyCells } from '../engine/systems/enemySystem';
import { getBotDirection } from './botController';
import { generateVision, rotateToVision, rotateToWorld } from './vision';

export interface DualObservation {
  input: BotInput;
  occupied: boolean[][];
  foodValues: number[][];
  direction: Direction;
  tick: number;
  level: number;
  mode: GameState['gameMode'];
  snake: Snake;
}

/** History stays in image coordinates: rotate the old view, never translate it. */
export function buildDualObservation(
  state: GameState,
  snake: Snake,
  settings: GameSettings,
  previous?: DualObservation,
): DualObservation {
  const size = settings.visionSize;
  const center = Math.floor(size / 2);
  const matrix = () => Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const vision = generateVision(snake.head, snake.direction, state, settings);
  const events = matrix();
  const foodValues = matrix();
  const occupied = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const key = (pos: Position) => `${pos.x},${pos.y}`;
  const obstacles = new Set(state.walls.map(key));
  for (const other of state.snakes) {
    if (other.alive) other.segments.forEach(segment => obstacles.add(key(segment)));
  }
  for (const enemy of state.enemies) getEnemyCells(enemy).forEach(cell => obstacles.add(key(cell)));
  const foods = new Map<string, number>();
  for (const food of state.foods) {
    if (!foods.has(key(food.pos))) foods.set(key(food.pos), getFoodReward(food, settings).points);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const world = rotateToWorld(x - center, y - center, snake.direction, snake.head);
      occupied[y][x] = !inBounds(world, state.width, state.height) || obstacles.has(key(world));
      if (occupied[y][x]) vision[y][x] = -100;
      else foodValues[y][x] = foods.get(key(world)) ?? 0;
    }
  }
  const threaten = (world: Position, value: number) => {
    const local = rotateToVision(world.x - snake.head.x, world.y - snake.head.y, snake.direction);
    const x = local.x + center;
    const y = local.y + center;
    if (x >= 0 && x < size && y >= 0 && y < size) events[y][x] = Math.min(events[y][x], value);
  };
  for (const other of state.snakes) {
    if (!other.alive || other.id === snake.id) continue;
    other.segments.forEach((segment, index) => threaten(segment, index === 0 ? -1 : index === 1 ? -0.8 : -0.6));
    for (const action of ['left', 'front', 'right'] as const) {
      const direction = getBotDirection(other.direction, action);
      threaten(rotateToWorld(0, -1, direction, other.head), -0.2);
    }
  }
  for (const enemy of state.enemies) {
    const frontX = enemy.facing === 'left' ? enemy.pos.x : enemy.pos.x + enemy.width - 1;
    for (const cell of getEnemyCells(enemy)) threaten(cell, cell.x === frontX ? -1 : -0.8);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const pos = { x: enemy.pos.x + dx, y: enemy.pos.y + dy };
        if (!canOccupy(enemy, pos, state)) continue;
        for (const cell of getEnemyCells(enemy, pos)) {
          if (!enemyOccupiesPosition(enemy, cell)) threaten(cell, -0.6);
        }
      }
    }
  }
  if (previous && previous.snake === snake && previous.level === state.level
    && previous.mode === state.gameMode && previous.tick < state.tickCount
    && previous.occupied.length === size) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const worldOffset = rotateToWorld(x - center, y - center, previous.direction, { x: 0, y: 0 });
        const local = rotateToVision(worldOffset.x, worldOffset.y, snake.direction);
        const nx = local.x + center;
        const ny = local.y + center;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size || events[ny][nx] < 0) continue;
        if (previous.occupied[y][x] && !occupied[ny][nx]) events[ny][nx] = 0.5;
        if (foodValues[ny][nx] > previous.foodValues[y][x]) events[ny][nx] = 1;
      }
    }
  }
  return {
    input: { vision, events, snakeLength: snake.segments.length, satiety: snake.satiety },
    occupied, foodValues, direction: snake.direction, tick: state.tickCount,
    level: state.level, mode: state.gameMode, snake,
  };
}
