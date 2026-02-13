import { Rabbit, Position, GameState, RabbitPhase } from '../types';
import { gameSettings } from '../settings';
import { inBounds } from '../board';

/**
 * Chebyshev distance between two positions.
 */
export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Determine the lifecycle phase of a rabbit based on its age.
 */
export function getRabbitPhase(rabbit: Rabbit): RabbitPhase {
  if (rabbit.age < gameSettings.rabbitYoungAge) return 'young';
  if (rabbit.age < gameSettings.rabbitAdultAge) return 'adult';
  return 'old';
}

/**
 * Count rabbits within Chebyshev distance <= radius from position.
 */
export function countNearbyRabbits(pos: Position, rabbits: Rabbit[], radius: number, excludeSelf?: Rabbit): number {
  let count = 0;
  for (const r of rabbits) {
    if (r === excludeSelf) continue;
    if (chebyshevDistance(pos, r.pos) <= radius) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a position is valid for a new rabbit (not on wall/snake, far enough from other rabbits).
 */
export function isValidRabbitPosition(
  pos: Position,
  state: GameState
): boolean {
  if (!inBounds(pos, state.width, state.height)) return false;

  // Not on wall
  if (state.walls.some(w => w.x === pos.x && w.y === pos.y)) return false;

  // Not on snake
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    if (snake.segments.some(s => s.x === pos.x && s.y === pos.y)) return false;
  }

  // Chebyshev distance > 1 from all existing rabbits
  for (const rabbit of state.rabbits) {
    if (chebyshevDistance(pos, rabbit.pos) <= 1) return false;
  }

  return true;
}

/**
 * Process rabbit aging, reproduction, and death for one tick.
 * - Increments age and clockNum
 * - Reproduction only during adult phase
 * - Removes rabbits that reached max age
 */
export function processRabbitReproduction(state: GameState): Rabbit[] {
  const newRabbits: Rabbit[] = [];

  for (const rabbit of state.rabbits) {
    rabbit.age++;
    rabbit.clockNum++;
  }

  // Reproduction (adults only)
  for (const rabbit of state.rabbits) {
    const phase = getRabbitPhase(rabbit);
    if (phase !== 'adult') continue;

    if (rabbit.clockNum < gameSettings.reproductionMinCooldown) continue;
    if (rabbit.reproductionCount >= gameSettings.maxReproductions) continue;

    // Count neighbors in the configured radius
    const nearbyCount = countNearbyRabbits(
      rabbit.pos, state.rabbits,
      gameSettings.neighborReproductionRadius, rabbit
    );
    if (nearbyCount >= gameSettings.maxReproductionNeighbors) continue;

    let probability = gameSettings.reproductionProbabilityBase * rabbit.clockNum;
    probability *= (1 - gameSettings.neighborReproductionPenalty * nearbyCount);

    if (Math.random() < probability) {
      const offspring = trySpawnOffspring(rabbit, state);
      if (offspring) {
        newRabbits.push(offspring);
        rabbit.clockNum = 0;
        rabbit.reproductionCount++;
      }
    }
  }

  // Add new rabbits
  state.rabbits.push(...newRabbits);

  // Remove dead (old) rabbits
  state.rabbits = state.rabbits.filter(r => r.age < gameSettings.rabbitMaxAge);

  return newRabbits;
}

/**
 * Try to find a valid position for offspring near the parent.
 */
function trySpawnOffspring(parent: Rabbit, state: GameState): Rabbit | null {
  const directions: Position[] = [];

  // All positions at distance 1 and 2 (Chebyshev)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist >= 1 && dist <= 2) {
        directions.push({ x: parent.pos.x + dx, y: parent.pos.y + dy });
      }
    }
  }

  // Shuffle
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }

  for (const pos of directions) {
    if (isValidRabbitPosition(pos, state)) {
      return { pos, age: 0, clockNum: 0, reproductionCount: 0 };
    }
  }

  return null;
}
