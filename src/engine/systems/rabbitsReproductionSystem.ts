import { Food, Position, GameState, FoodPhase } from '../types';
import { EngineContext } from '../context';
import { GameSettings } from '../settings';
import { inBounds } from '../board';
import { AppleFoodEntity } from '../entities/AppleFoodEntity';
import { RabbitEntity } from '../entities/RabbitEntity';

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
 * Determine the lifecycle phase of a rabbit based on its age.
 */
export function getFoodPhase(food: Food, settings: GameSettings): FoodPhase {
  if (food.age < settings.foodYoungAge) return 'young';
  if (food.age < settings.foodAdultAge) return 'adult';
  return 'old';
}

/**
 * Count rabbits within Chebyshev distance <= radius from position.
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
 * Check if a position is valid for a new rabbit (not on wall/snake, far enough from other rabbits).
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

  // Chebyshev distance > 1 from all existing rabbits
  for (const food of state.foods) {
    if (chebyshevDistance(pos, food.pos) <= 1) return false;
  }

  return true;
}

/**
 * Process rabbit aging, reproduction, and death for one tick.
 * - Increments age and clockNum
 * - Reproduction only during adult phase
 * - Removes rabbits that reached max age
 */
export function processFoodLifecycle(state: GameState, ctx: EngineContext): FoodBirth[] {
  const settings = ctx.settings;
  const randomPort = ctx.rng;
  const births: FoodBirth[] = [];

  for (const food of state.foods) {
    food.tickLifecycle();
  }

  // Reproduction (adults only, for all food kinds; rules are the same for apples and rabbits)
  for (const parentFood of state.foods) {
    const phase = getFoodPhase(parentFood, settings);
    if (phase !== 'adult') continue;

    if (parentFood.clockNum < settings.reproductionMinCooldown) continue;
    if (parentFood.reproductionCount >= settings.maxReproductions) continue;

    // Count neighbors in the configured radius
    const nearbyCount = countNearbyFood(
      parentFood.pos, state.foods,
      settings.neighborReproductionRadius, parentFood
    );
    if (nearbyCount >= settings.maxReproductionNeighbors) continue;

    let probability = settings.reproductionProbabilityBase * parentFood.clockNum;
    probability *= (1 - settings.neighborReproductionPenalty * nearbyCount);

    if (randomPort.next() < probability) {
      const offspring = trySpawnOffspring(parentFood, state, randomPort);
      if (offspring) {
        births.push({
          parentPos: { ...parentFood.pos },
          child: offspring,
        });
        parentFood.resetReproductionClock();
        parentFood.incrementReproductionCount();
      }
    }
  }

  // Add newborn rabbit-food
  state.foods.push(...births.map(birth => birth.child));

  // Remove expired food (keeps lifecycle bounded in dense levels)
  state.foods = state.foods.filter(food => food.age < settings.foodMaxAge);
  state.rabbits = state.foods;

  return births;
}

// Backward-compatible aliases for older tests/modules.
export type RabbitBirth = FoodBirth;
export const getRabbitPhase = getFoodPhase;
export const countNearbyRabbits = countNearbyFood;
export const isValidRabbitPosition = isValidFoodPosition;
export const processRabbitReproduction = processFoodLifecycle;

/**
 * Try to find a valid position for offspring near the parent.
 */
function trySpawnOffspring(parent: Food, state: GameState, rng: { next(): number; nextInt(max: number): number }): Food | null {
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
      return RabbitEntity.newborn(candidatePosition);
    }
  }

  return null;
}
