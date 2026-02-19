import { inBounds } from '../board';
import { EngineContext } from '../context';
import { AppleFoodEntity } from '../entities/AppleFoodEntity';
import { RabbitFoodEntity } from '../entities/RabbitFoodEntity';
import { GameSettings } from '../settings';
import { Food, FoodPhase, GameState, Position } from '../types';

export function getFoodPhase(food: Food, settings: GameSettings): FoodPhase {
  if (food.age < settings.rabbitYoungAge) return 'young';
  if (food.age < settings.rabbitAdultAge) return 'adult';
  return 'old';
}

export function getFoodReward(food: Food, settings: GameSettings): { points: number; growth: number } {
  const phase = getFoodPhase(food, settings);
  if (food.kind === 'apple') {
    if (phase === 'adult') return { points: 2, growth: 2 };
    return { points: 1, growth: 1 };
  }
  return { points: 1, growth: 1 };
}

export function createLevelFood(level: number, pos: Position, settings: GameSettings, phase: FoodPhase = 'young'): Food {
  if (level <= 110) {
    const age = phase === 'young' ? 0 : (phase === 'adult' ? settings.rabbitYoungAge : settings.rabbitAdultAge);
    return AppleFoodEntity.newborn(pos, age);
  }
  return RabbitFoodEntity.newborn(pos);
}

export function syncLegacyFoodAlias(state: GameState): void {
  state.rabbits = state.foods;
}

export function autoReplenishFood(state: GameState, ctx: EngineContext): void {
  const aliveSnakes = state.snakes.filter(snake => snake.alive);
  if (aliveSnakes.length === 0) return;
  if (state.foods.length >= aliveSnakes.length) return;
  if (
    state.lastAutoFoodSpawnTick > 0 &&
    state.tickCount - state.lastAutoFoodSpawnTick < ctx.settings.hungerThreshold
  ) {
    return;
  }

  const spawnPos = findFarthestFoodPosition(state);
  if (!spawnPos) return;
  state.foods.push(createLevelFood(state.level, spawnPos, ctx.settings, 'adult'));
  state.lastAutoFoodSpawnTick = state.tickCount;
  syncLegacyFoodAlias(state);
}

function findFarthestFoodPosition(state: GameState): Position | null {
  const occupied = new Set<string>();
  for (const wall of state.walls) occupied.add(`${wall.x},${wall.y}`);
  for (const snake of state.snakes) {
    for (const segment of snake.segments) occupied.add(`${segment.x},${segment.y}`);
  }
  for (const food of state.foods) occupied.add(`${food.pos.x},${food.pos.y}`);

  const snakeHeads = state.snakes.filter(snake => snake.alive).map(snake => snake.head);
  if (snakeHeads.length === 0) return null;

  let bestPos: Position | null = null;
  let bestMinDistance = -1;
  let bestSpread = Number.POSITIVE_INFINITY;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const pos = { x, y };
      if (!inBounds(pos, state.width, state.height)) continue;
      if (occupied.has(`${x},${y}`)) continue;

      const distances = snakeHeads.map(head => Math.max(Math.abs(head.x - x), Math.abs(head.y - y)));
      const minDistance = Math.min(...distances);
      const maxDistance = Math.max(...distances);
      const spread = maxDistance - minDistance;

      if (minDistance > bestMinDistance || (minDistance === bestMinDistance && spread < bestSpread)) {
        bestMinDistance = minDistance;
        bestSpread = spread;
        bestPos = pos;
      }
    }
  }

  return bestPos;
}
