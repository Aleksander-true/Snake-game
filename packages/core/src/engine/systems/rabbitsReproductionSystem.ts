import { Food, Position, GameState } from '../types';
import { EngineContext } from '../context';
import { GameSettings } from '../settings';
import { inBounds } from '../board';
import { AppleFoodEntity } from '../entities/AppleFoodEntity';
import { ChickenFoodEntity } from '../entities/ChickenFoodEntity';
import { MeatFoodEntity } from '../entities/MeatFoodEntity';
import { RabbitFoodEntity } from '../entities/RabbitFoodEntity';
import { assignFoodId, getFoodPhase } from './foodSystem';

export interface FoodBirth {
  parentPos: Position;
  child: Food;
}

/**
 * Chebyshev distance between two positions.
 */
export function chebyshevDistance(positionA: Position, positionB: Position): number {
  return Math.max(Math.abs(positionA.x - positionB.x), Math.abs(positionA.y - positionB.y));
}

/**
 * Count food items within Chebyshev distance <= radius from position.
 */
export function countNearbyFood(pos: Position, foods: Food[], radius: number, excludeSelf?: Food): number {
  let count = 0;
  for (const food of foods) {
    if (food === excludeSelf) continue;
    if (chebyshevDistance(pos, food.pos) <= radius) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a position is valid for new food (not on a wall or snake, and far enough from other food).
 */
export function isValidFoodPosition(
  pos: Position,
  state: GameState
): boolean {
  if (!inBounds(pos, state.width, state.height)) return false;

  // Not on wall
  if (state.walls.some(wall => wall.x === pos.x && wall.y === pos.y)) return false;

  // Not on snake
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    if (snake.segments.some(segment => segment.x === pos.x && segment.y === pos.y)) return false;
  }

  // Chebyshev distance > 1 from all existing food
  for (const food of state.foods) {
    if (chebyshevDistance(pos, food.pos) <= 1) return false;
  }

  return true;
}

/** Check exact cell occupancy without applying food-density restrictions. */
export function isFreeFoodCell(pos: Position, state: GameState): boolean {
  if (!inBounds(pos, state.width, state.height)) return false;
  if (state.walls.some(wall => wall.x === pos.x && wall.y === pos.y)) return false;
  if (state.snakes.some(snake => snake.segments.some(segment => samePosition(segment, pos)))) return false;
  return !state.foods.some(food => samePosition(food.pos, pos));
}

/**
 * Process food aging, reproduction, and expiration for one tick.
 * - Increments age and clockNum
 * - Reproduction only during adult phase
 * - Removes food that reached max age
 */
export function processFoodLifecycle(state: GameState, ctx: EngineContext): FoodBirth[] {
  const settings = ctx.settings;
  const randomPort = ctx.rng;
  const births: FoodBirth[] = [];

  for (const food of state.foods) {
    food.tickLifecycle();
    if (
      food.kind === 'chicken'
      && (food.age === settings.foodYoungAge || food.age === settings.foodAdultAge)
    ) {
      food.movementClock = 0;
      if (food.age === settings.foodAdultAge) food.resetReproductionClock();
    }
  }

  const activeFoods: Food[] = [];
  for (const food of state.foods) {
    if (food.kind === 'meat' && food.age >= settings.meatMaxAge) continue;
    if (food.kind !== 'meat' && food.age >= settings.foodMaxAge) {
      if (food.kind === 'chicken') {
        const meat = assignFoodId(state, MeatFoodEntity.newborn({ ...food.pos }));
        activeFoods.push(meat);
        births.push({ parentPos: { ...food.pos }, child: meat });
      }
      continue;
    }
    activeFoods.push(food);
  }
  state.foods = activeFoods;

  const parents = [...state.foods];

  for (const parentFood of parents) {
    if (parentFood.kind === 'meat') continue;
    const phase = getFoodPhase(parentFood, settings);
    const canReproduce = parentFood.kind === 'chicken' ? phase === 'old' : phase === 'adult';
    if (!canReproduce) continue;

    const reproductionLimit = parentFood.kind === 'chicken'
      ? settings.chickenMaxEggs
      : settings.maxReproductions;
    if (parentFood.reproductionCount >= reproductionLimit) continue;

    if (parentFood.kind === 'chicken') {
      if (isFoodPopulationAtReproductionLimit(state, settings)) continue;

      const nearbyCount = countNearbyFood(
        parentFood.pos,
        state.foods,
        settings.neighborReproductionRadius,
        parentFood
      );
      if (nearbyCount >= settings.maxReproductionNeighbors) continue;
      if (randomPort.next() >= settings.chickenEggLayingProbability) continue;

      const offspring = trySpawnOffspring(parentFood, state, randomPort);
      if (!offspring) continue;
      assignFoodId(state, offspring);
      state.foods.push(offspring);
      births.push({ parentPos: { ...parentFood.pos }, child: offspring });
      parentFood.incrementReproductionCount();
      continue;
    }

    if (parentFood.clockNum < settings.reproductionMinCooldown) continue;
    if (isFoodPopulationAtReproductionLimit(state, settings)) continue;

    const nearbyCount = countNearbyFood(
      parentFood.pos,
      state.foods,
      settings.neighborReproductionRadius,
      parentFood
    );
    if (nearbyCount >= settings.maxReproductionNeighbors) continue;

    let probability = settings.reproductionProbabilityBase * parentFood.clockNum;
    probability *= (1 - settings.neighborReproductionPenalty * nearbyCount);

    if (randomPort.next() < probability) {
      const offspring = trySpawnOffspring(parentFood, state, randomPort);
      if (offspring) {
        assignFoodId(state, offspring);
        state.foods.push(offspring);
        births.push({
          parentPos: { ...parentFood.pos },
          child: offspring,
        });
        parentFood.resetReproductionClock();
        parentFood.incrementReproductionCount();
      }
    }
  }

  return births;
}

function isFoodPopulationAtReproductionLimit(
  state: GameState,
  settings: GameSettings
): boolean {
  const limit = settings.foodReproductionLimitBase
    + state.snakes.length
    - state.difficultyLevel;
  return state.foods.length >= limit;
}

/**
 * Try to find a valid position for offspring near the parent.
 */
function trySpawnOffspring(
  parent: Food,
  state: GameState,
  rng: { next(): number; nextInt(max: number): number }
): Food | null {
  const candidatePositions: Position[] = [];

  // All positions at distance 1 and 2 (Chebyshev)
  for (let deltaX = -2; deltaX <= 2; deltaX++) {
    for (let deltaY = -2; deltaY <= 2; deltaY++) {
      if (deltaX === 0 && deltaY === 0) continue;
      const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      if (distance >= 1 && distance <= 2) {
        candidatePositions.push({ x: parent.pos.x + deltaX, y: parent.pos.y + deltaY });
      }
    }
  }

  // Fisher-Yates shuffle using rng
  for (let currentIndex = candidatePositions.length - 1; currentIndex > 0; currentIndex--) {
    const randomIndex = rng.nextInt(currentIndex + 1);
    [candidatePositions[currentIndex], candidatePositions[randomIndex]] = [candidatePositions[randomIndex], candidatePositions[currentIndex]];
  }

  for (const candidatePosition of candidatePositions) {
    if (isValidFoodPosition(candidatePosition, state)) {
      if (parent.kind === 'apple') {
        return AppleFoodEntity.newborn(candidatePosition);
      }
      if (parent.kind === 'chicken') {
        return ChickenFoodEntity.newborn(candidatePosition);
      }
      return RabbitFoodEntity.newborn(candidatePosition);
    }
  }

  return null;
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
