import { EngineContext } from '../context';
import { AppleFoodEntity } from '../entities/AppleFoodEntity';
import { ChickenFoodEntity } from '../entities/ChickenFoodEntity';
import { RandomPort } from '../ports';
import { GameSettings } from '../settings';
import { Food, FoodPhase, GameState, Position } from '../types';

export function getFoodPhase(food: Food, settings: GameSettings): FoodPhase {
  if (food.age < settings.foodYoungAge) return 'young';
  if (food.age < settings.foodAdultAge) return 'adult';
  return 'old';
}

export function getFoodReward(food: Food, settings: GameSettings): { points: number; growth: number } {
  const phase = getFoodPhase(food, settings);
  switch (food.kind) {
    case 'apple':
      if (phase === 'adult') return { points: 2, growth: 2 };
      return { points: 1, growth: 1 };
    case 'chicken':
      if (phase === 'young') {
        return { points: settings.chickenEggScoreValue, growth: settings.chickenEggGrowthValue };
      }
      if (phase === 'adult') {
        return { points: settings.chickenChickScoreValue, growth: settings.chickenChickGrowthValue };
      }
      return { points: settings.chickenAdultScoreValue, growth: settings.chickenAdultGrowthValue };
    case 'meat':
      return { points: settings.meatScoreValue, growth: settings.meatGrowthValue };
    default:
      return { points: 1, growth: 1 };
  }
}

export function createLevelFood(
  level: number,
  pos: Position,
  settings: GameSettings,
  phase: FoodPhase = 'young',
  rng?: RandomPort,
  id = ''
): Food {
  if (
    rng
    && level >= settings.chickenSpawnStartLevel
    && rng.next() < settings.chickenSpawnProbability
  ) {
    return ChickenFoodEntity.newborn(pos, id);
  }
  const age = phase === 'young' ? 0 : (phase === 'adult' ? settings.foodYoungAge : settings.foodAdultAge);
  return AppleFoodEntity.newborn(pos, age, id);
}

export function assignFoodId(state: GameState, food: Food): Food {
  if (food.id) return food;
  const nextId = state.nextFoodId ?? 0;
  food.id = `food-${nextId}`;
  state.nextFoodId = nextId + 1;
  return food;
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
  state.foods.push(assignFoodId(
    state,
    createLevelFood(state.level, spawnPos, ctx.settings, 'adult', ctx.rng)
  ));
  state.lastAutoFoodSpawnTick = state.tickCount;
}

/** Spawn one new food item on every configured periodic spawn tick. */
export function spawnPeriodicFood(state: GameState, ctx: EngineContext): void {
  const interval = ctx.settings.foodPeriodicSpawnInterval;
  if (interval <= 0 || state.tickCount <= 0 || state.tickCount % interval !== 0) return;

  const aliveSnakeCount = state.snakes.filter(snake => snake.alive).length;
  if (aliveSnakeCount === 0) return;
  const spawnPos = findFarthestFoodPosition(state);
  if (!spawnPos) return;

  const appleCount = state.foods.filter(food => food.kind === 'apple').length;
  const chickenProbability = getPeriodicChickenSpawnProbability(
    appleCount,
    aliveSnakeCount,
    state.level,
    ctx.settings
  );
  const spawnChicken = chickenProbability >= 1
    || (chickenProbability > 0 && ctx.rng.next() < chickenProbability);
  const food = spawnChicken
    ? ChickenFoodEntity.newborn(spawnPos)
    : AppleFoodEntity.newborn(spawnPos);
  state.foods.push(assignFoodId(state, food));
}

export function getPeriodicChickenSpawnProbability(
  appleCount: number,
  aliveSnakeCount: number,
  level: number,
  settings: GameSettings
): number {
  if (level < settings.chickenSpawnStartLevel) return 0;

  const firstCrowdedAppleCount = Math.min(
    aliveSnakeCount * settings.chickenCrowdedApplePerSnakeMultiplier,
    settings.chickenCrowdedAppleCount
  ) + 1;
  if (appleCount < firstCrowdedAppleCount) return settings.chickenSpawnProbability;
  if (appleCount >= settings.chickenGuaranteedSpawnAppleCount) return 1;

  const interpolationRange = settings.chickenGuaranteedSpawnAppleCount - firstCrowdedAppleCount;
  if (interpolationRange <= 0) return 1;
  const progress = (appleCount - firstCrowdedAppleCount) / interpolationRange;
  return settings.chickenCrowdedSpawnProbability
    + (1 - settings.chickenCrowdedSpawnProbability) * progress;
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
