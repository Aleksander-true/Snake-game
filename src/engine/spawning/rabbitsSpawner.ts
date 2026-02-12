import { Position, Rabbit, GameState } from '../types';
import { inBounds } from '../board';
import { chebyshevDistance } from '../systems/rabbitsReproductionSystem';

/**
 * Spawn initial rabbits for a level.
 * Rabbits cannot be on walls, snakes, or within Chebyshev distance 1 of each other.
 */
export function spawnRabbits(
  count: number,
  state: GameState
): Rabbit[] {
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
    const pos: Position = {
      x: Math.floor(Math.random() * state.width),
      y: Math.floor(Math.random() * state.height),
    };

    const key = `${pos.x},${pos.y}`;
    if (occupiedSet.has(key)) continue;

    // Check Chebyshev distance > 1 from all existing rabbits
    const tooClose = rabbits.some(r => chebyshevDistance(pos, r.pos) <= 1);
    if (tooClose) continue;

    const rabbit: Rabbit = {
      pos,
      clockNum: 0,
      reproductionCount: 0,
    };

    rabbits.push(rabbit);
    occupiedSet.add(key);
  }

  return rabbits;
}
