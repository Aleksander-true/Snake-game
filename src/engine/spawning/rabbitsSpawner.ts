import { Position, Rabbit, GameState } from '../types';
import { EngineContext } from '../context';
import { chebyshevDistance } from '../systems/rabbitsReproductionSystem';
import { RabbitEntity } from '../entities/RabbitEntity';

/**
 * Spawn initial rabbits for a level.
 * Rabbits cannot be on walls, snakes, or within Chebyshev distance 1 of each other.
 */
export function spawnRabbits(
  count: number,
  state: GameState,
  ctx: EngineContext
): Rabbit[] {
  const randomPort = ctx.rng;
  const rabbits: Rabbit[] = [];
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

  while (rabbits.length < count && attempts < maxAttempts) {
    attempts++;
    const candidatePosition: Position = {
      x: randomPort.nextInt(state.width),
      y: randomPort.nextInt(state.height),
    };

    const positionKey = `${candidatePosition.x},${candidatePosition.y}`;
    if (occupiedSet.has(positionKey)) continue;

    // Check Chebyshev distance > 1 from all existing rabbits
    const tooClose = rabbits.some(rabbit => chebyshevDistance(candidatePosition, rabbit.pos) <= 1);
    if (tooClose) continue;

    const rabbit = RabbitEntity.newborn(candidatePosition);

    rabbits.push(rabbit);
    occupiedSet.add(positionKey);
  }

  return rabbits;
}
