import { inBounds } from '../board';
import { MeatFoodEntity } from '../entities/MeatFoodEntity';
import { DomainEvent } from '../events';
import { Food, GameState, Position, Snake } from '../types';
import { assignFoodId } from './foodSystem';
import { chebyshevDistance } from './rabbitsReproductionSystem';

const MEAT_DEATH_REASONS = new Set([
  'Врезалась в стену',
  'Столкнулась с другой змейкой',
  'Съела саму себя',
]);

/** Create meat once for snakes that died from collisions during the current tick. */
export function createMeatDropsForSnakeDeaths(
  state: GameState,
  events: DomainEvent[]
): Food[] {
  const drops: Food[] = [];
  const processedSnakeIds = new Set<number>();

  for (const event of events) {
    if (event.type !== 'SNAKE_DIED' || !MEAT_DEATH_REASONS.has(event.reason)) continue;
    if (processedSnakeIds.has(event.snakeId)) continue;
    processedSnakeIds.add(event.snakeId);

    const snake = state.snakes.find(candidate => candidate.id === event.snakeId);
    if (!snake) continue;
    drops.push(...createSnakeMeatDrops(state, snake));
  }

  return drops;
}

function createSnakeMeatDrops(state: GameState, snake: Snake): Food[] {
  const desiredCount = Math.ceil(snake.segments.length / 3);
  const drops: Food[] = [];

  for (let groupStart = 0; groupStart < snake.segments.length; groupStart += 3) {
    if (drops.length >= desiredCount) break;
    const group = snake.segments.slice(groupStart, groupStart + 3);
    const dropPos = findDropPosition(group, snake.segments, state);
    if (!dropPos) continue;
    const meat = assignFoodId(state, MeatFoodEntity.newborn(dropPos));
    state.foods.push(meat);
    drops.push(meat);
  }

  while (drops.length < desiredCount) {
    const dropPos = findNearestFreePosition(snake.segments, state);
    if (!dropPos) break;
    const meat = assignFoodId(state, MeatFoodEntity.newborn(dropPos));
    state.foods.push(meat);
    drops.push(meat);
  }

  return drops;
}

function findDropPosition(group: Position[], body: Position[], state: GameState): Position | null {
  for (const pos of group) {
    if (isValidDropPosition(pos, state)) return { ...pos };
  }

  const anchor = group[0];
  const remainingBody = [...body].sort((left, right) => {
    const distanceDiff = chebyshevDistance(left, anchor) - chebyshevDistance(right, anchor);
    if (distanceDiff !== 0) return distanceDiff;
    return left.y - right.y || left.x - right.x;
  });
  for (const pos of remainingBody) {
    if (isValidDropPosition(pos, state)) return { ...pos };
  }

  return null;
}

function findNearestFreePosition(body: Position[], state: GameState): Position | null {
  const candidates: Position[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const pos = { x, y };
      if (isValidDropPosition(pos, state)) candidates.push(pos);
    }
  }
  candidates.sort((left, right) => {
    const leftDistance = Math.min(...body.map(segment => chebyshevDistance(left, segment)));
    const rightDistance = Math.min(...body.map(segment => chebyshevDistance(right, segment)));
    return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
  });
  return candidates[0] ?? null;
}

function isValidDropPosition(pos: Position, state: GameState): boolean {
  if (!inBounds(pos, state.width, state.height)) return false;
  if (state.walls.some(wall => samePosition(wall, pos))) return false;
  if (state.foods.some(food => samePosition(food.pos, pos))) return false;
  return !state.snakes.some(snake =>
    snake.alive && snake.segments.some(segment => samePosition(segment, pos))
  );
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
