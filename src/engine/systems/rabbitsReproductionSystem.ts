import { Rabbit, Position, GameState, RabbitPhase } from '../types';
import { EngineContext } from '../context';
import { GameSettings } from '../settings';
import { inBounds } from '../board';
import { RabbitEntity } from '../entities/RabbitEntity';

export interface RabbitBirth {
  parentPos: Position;
  child: Rabbit;
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
export function getRabbitPhase(rabbit: Rabbit, settings: GameSettings): RabbitPhase {
  if (rabbit.age < settings.rabbitYoungAge) return 'young';
  if (rabbit.age < settings.rabbitAdultAge) return 'adult';
  return 'old';
}

/**
 * Count rabbits within Chebyshev distance <= radius from position.
 */
export function countNearbyRabbits(pos: Position, rabbits: Rabbit[], radius: number, excludeSelf?: Rabbit): number {
  let count = 0;
  for (const rabbit of rabbits) {
    if (rabbit === excludeSelf) continue;
    if (chebyshevDistance(pos, rabbit.pos) <= radius) {
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
  if (state.walls.some(wall => wall.x === pos.x && wall.y === pos.y)) return false;

  // Not on snake
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    if (snake.segments.some(segment => segment.x === pos.x && segment.y === pos.y)) return false;
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
export function processRabbitReproduction(state: GameState, ctx: EngineContext): RabbitBirth[] {
  const settings = ctx.settings;
  const randomPort = ctx.rng;
  const births: RabbitBirth[] = [];

  for (const rabbit of state.rabbits) {
    rabbit.tickLifecycle();
  }

  // Reproduction (adults only)
  for (const rabbit of state.rabbits) {
    const phase = getRabbitPhase(rabbit, settings);
    if (phase !== 'adult') continue;

    if (rabbit.clockNum < settings.reproductionMinCooldown) continue;
    if (rabbit.reproductionCount >= settings.maxReproductions) continue;

    // Count neighbors in the configured radius
    const nearbyCount = countNearbyRabbits(
      rabbit.pos, state.rabbits,
      settings.neighborReproductionRadius, rabbit
    );
    if (nearbyCount >= settings.maxReproductionNeighbors) continue;

    let probability = settings.reproductionProbabilityBase * rabbit.clockNum;
    probability *= (1 - settings.neighborReproductionPenalty * nearbyCount);

    if (randomPort.next() < probability) {
      const offspring = trySpawnOffspring(rabbit, state, randomPort);
      if (offspring) {
        births.push({
          parentPos: { ...rabbit.pos },
          child: offspring,
        });
        rabbit.resetReproductionClock();
        rabbit.incrementReproductionCount();
      }
    }
  }

  // Add new rabbits
  state.rabbits.push(...births.map(birth => birth.child));

  // Remove dead (old) rabbits
  state.rabbits = state.rabbits.filter(rabbit => rabbit.age < settings.rabbitMaxAge);

  return births;
}

/**
 * Try to find a valid position for offspring near the parent.
 */
function trySpawnOffspring(parent: Rabbit, state: GameState, rng: { next(): number; nextInt(max: number): number }): Rabbit | null {
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
    if (isValidRabbitPosition(candidatePosition, state)) {
      return RabbitEntity.newborn(candidatePosition);
    }
  }

  return null;
}
