import { Position, Food, GameState } from '../types';
import { EngineContext } from '../context';
import { chebyshevDistance } from '../systems/rabbitsReproductionSystem';
import { assignFoodId, createLevelFood } from '../systems/foodSystem';
import { getEnemyCells } from '../systems/enemySystem';

/**
 * Spawn initial food for a level.
 * Food cannot be on walls, snakes, or within Chebyshev distance 1 of each other.
 */
export function spawnFood(
  count: number,
  state: GameState,
  ctx: EngineContext
): Food[] {
  const randomPort = ctx.rng;
  const foods: Food[] = [];
  const occupiedSet = new Set<string>();

  // Mark walls as occupied
  for (const wall of state.walls) {
    occupiedSet.add(`${wall.x},${wall.y}`);
  }

  // Mark snake segments as occupied
  for (const snake of state.snakes) {
    for (const seg of snake.segments) {
      occupiedSet.add(`${seg.x},${seg.y}`);
    }
  }
  for (const enemy of state.enemies) {
    for (const cell of getEnemyCells(enemy)) occupiedSet.add(`${cell.x},${cell.y}`);
  }

  let attempts = 0;
  let adultApplesCreated = 0;
  const maxAttempts = count * 100;

  while (foods.length < count && attempts < maxAttempts) {
    attempts++;
    const candidatePosition: Position = {
      x: randomPort.nextInt(state.width),
      y: randomPort.nextInt(state.height),
    };

    const positionKey = `${candidatePosition.x},${candidatePosition.y}`;
    if (occupiedSet.has(positionKey)) continue;

    // Check Chebyshev distance > 1 from all existing food items
    const tooClose = foods.some(food => chebyshevDistance(candidatePosition, food.pos) <= 1);
    if (tooClose) continue;

    const phase = adultApplesCreated < state.snakes.length ? 'adult' : 'young';
    const food = assignFoodId(
      state,
      createLevelFood(state.level, candidatePosition, ctx.settings, phase, ctx.rng)
    );

    foods.push(food);
    if (food.kind === 'apple' && phase === 'adult') adultApplesCreated++;
    occupiedSet.add(positionKey);
  }

  return foods;
}
