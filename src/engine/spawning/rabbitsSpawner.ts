import { Position, Food, GameState } from '../types';
import { EngineContext } from '../context';
import { chebyshevDistance } from '../systems/rabbitsReproductionSystem';
import { createLevelFood } from '../systems/foodSystem';

/**
 * Spawn initial food for a level.
 * Food cannot be on walls, snakes, or within Chebyshev distance 1 of each other.
 */
export function spawnRabbits(
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

  let attempts = 0;
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

    const adultQuota = state.snakes.length;
    const phase = foods.length < adultQuota ? 'adult' : 'young';
    const food = createLevelFood(state.level, candidatePosition, ctx.settings, phase);

    foods.push(food);
    occupiedSet.add(positionKey);
  }

  return foods;
}
