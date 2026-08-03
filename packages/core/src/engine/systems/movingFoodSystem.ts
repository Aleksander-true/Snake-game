import { EngineContext } from '../context';
import { getFoodPhase } from './foodSystem';
import { Food, GameState, Position } from '../types';
import { chebyshevDistance } from './rabbitsReproductionSystem';

const NEIGHBOR_OFFSETS: ReadonlyArray<Position> = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 },                     { x: 1, y: 0 },
  { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 },
];

/** Move chicks and adult chickens after lifecycle processing. */
export function processMovingFood(state: GameState, ctx: EngineContext): void {
  const chickens = state.foods
    .filter(food => food.kind === 'chicken')
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const chicken of chickens) {
    const phase = getFoodPhase(chicken, ctx.settings);
    if (phase === 'young') continue;
    if (chicken.age === ctx.settings.foodYoungAge || chicken.age === ctx.settings.foodAdultAge) continue;

    chicken.movementClock = (chicken.movementClock ?? 0) + 1;
    const interval = phase === 'adult'
      ? ctx.settings.chickenChickMoveInterval
      : ctx.settings.chickenAdultMoveInterval;
    if (chicken.movementClock < interval) continue;
    chicken.movementClock = 0;

    if (phase === 'adult') {
      moveChick(chicken, state, ctx);
    } else {
      moveAdultChicken(chicken, state, ctx);
    }
  }
}

function moveChick(chicken: Food, state: GameState, ctx: EngineContext): void {
  const origin = chicken.originPos ?? chicken.pos;
  const candidates = getNeighborPositions(chicken.pos).filter(candidate =>
    chebyshevDistance(candidate, origin) <= ctx.settings.chickenChickRoamRadius
    && isMovementCellFree(candidate, state, chicken)
  );
  const target = pickRandom(candidates, ctx);
  if (target) chicken.pos = target;
}

function moveAdultChicken(chicken: Food, state: GameState, ctx: EngineContext): void {
  const neighboringApples = state.foods.filter(food =>
    food.kind === 'apple' && chebyshevDistance(food.pos, chicken.pos) === 1
  );
  const apple = pickRandom(neighboringApples, ctx);
  if (apple) {
    chicken.pos = { ...apple.pos };
    state.foods.splice(state.foods.indexOf(apple), 1);
    chicken.age = ctx.settings.foodAdultAge;
    chicken.clockNum = 0;
    chicken.reproductionCount = 0;
    chicken.movementClock = 0;
    chicken.pendingMandatoryEgg = true;
    return;
  }

  const livingHeads = state.snakes.filter(snake => snake.alive).map(snake => snake.head);
  if (livingHeads.length === 0) return;
  const currentDistance = nearestDistance(chicken.pos, livingHeads);
  if (currentDistance > ctx.settings.chickenAdultThreatRadius) return;

  const freeNeighbors = getNeighborPositions(chicken.pos).filter(candidate =>
    isMovementCellFree(candidate, state, chicken)
  );
  const escapingNeighbors = freeNeighbors.filter(candidate =>
    nearestDistance(candidate, livingHeads) > currentDistance
  );
  const target = pickRandom(escapingNeighbors.length > 0 ? escapingNeighbors : freeNeighbors, ctx);
  if (target) chicken.pos = target;
}

function getNeighborPositions(origin: Position): Position[] {
  return NEIGHBOR_OFFSETS.map(offset => ({ x: origin.x + offset.x, y: origin.y + offset.y }));
}

function isMovementCellFree(pos: Position, state: GameState, movingFood: Food): boolean {
  if (pos.x < 0 || pos.x >= state.width || pos.y < 0 || pos.y >= state.height) return false;
  if (state.walls.some(wall => samePosition(wall, pos))) return false;
  if (state.snakes.some(snake => snake.segments.some(segment => samePosition(segment, pos)))) return false;
  return !state.foods.some(food => food !== movingFood && samePosition(food.pos, pos));
}

function nearestDistance(pos: Position, targets: Position[]): number {
  return Math.min(...targets.map(target => chebyshevDistance(pos, target)));
}

function pickRandom<T>(items: T[], ctx: EngineContext): T | null {
  if (items.length === 0) return null;
  return items[ctx.rng.nextInt(items.length)];
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
