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
  const apples = state.foods.filter(food => food.kind === 'apple');
  const neighbors = getNeighborPositions(chicken.pos);
  const livingHeads = state.snakes.filter(snake => snake.alive).map(snake => snake.head);
  const candidates = neighbors.filter(candidate => {
    const appleAtCandidate = apples.find(apple => samePosition(apple.pos, candidate));
    return isMovementCellFree(candidate, state, chicken, appleAtCandidate);
  });
  if (candidates.length === 0) return;

  let target: Position | null;
  const currentSnakeDistance = livingHeads.length > 0
    ? nearestDistance(chicken.pos, livingHeads)
    : Number.POSITIVE_INFINITY;

  if (currentSnakeDistance <= ctx.settings.chickenAdultThreatRadius) {
    target = pickSafestCandidate(candidates, livingHeads, ctx);
  } else if (apples.length > 0) {
    const nonApproachingCandidates = livingHeads.length === 0
      ? candidates
      : candidates.filter(candidate => {
          const candidateDistance = nearestDistance(candidate, livingHeads);
          const requiredDistance = currentSnakeDistance < ctx.settings.chickenAdultSafetyRadius
            ? currentSnakeDistance
            : ctx.settings.chickenAdultSafetyRadius;
          return candidateDistance >= requiredDistance;
        });
    const safeCandidates = nonApproachingCandidates.length > 0
      ? nonApproachingCandidates
      : getFarthestCandidates(candidates, livingHeads);
    const applePositions = apples.map(apple => apple.pos);
    const bestAppleDistance = Math.min(...safeCandidates.map(candidate =>
      nearestDistance(candidate, applePositions)
    ));
    const appleDirectedCandidates = safeCandidates.filter(candidate =>
      nearestDistance(candidate, applePositions) === bestAppleDistance
    );
    target = livingHeads.length > 0
      ? pickSafestCandidate(appleDirectedCandidates, livingHeads, ctx)
      : pickRandom(appleDirectedCandidates, ctx);
  } else if (livingHeads.length > 0) {
    const densities = candidates.map(candidate => ({
      candidate,
      snakeCount: countNearbyHeads(candidate, livingHeads, ctx.settings.chickenAdultThreatRadius),
    }));
    const minimumSnakeCount = Math.min(...densities.map(item => item.snakeCount));
    target = pickSafestCandidate(
      densities.filter(item => item.snakeCount === minimumSnakeCount).map(item => item.candidate),
      livingHeads,
      ctx
    );
  } else {
    target = pickRandom(candidates, ctx);
  }

  if (!target) return;
  chicken.pos = target;
  const eatenApple = apples.find(apple => samePosition(apple.pos, target));
  if (!eatenApple) return;
  state.foods.splice(state.foods.indexOf(eatenApple), 1);
  chicken.age = ctx.settings.foodAdultAge;
  chicken.clockNum = 0;
  chicken.reproductionCount = 0;
  chicken.movementClock = 0;
  chicken.pendingMandatoryEgg = true;
}

function getNeighborPositions(origin: Position): Position[] {
  return NEIGHBOR_OFFSETS.map(offset => ({ x: origin.x + offset.x, y: origin.y + offset.y }));
}

function isMovementCellFree(
  pos: Position,
  state: GameState,
  movingFood: Food,
  allowedFood?: Food
): boolean {
  if (pos.x < 0 || pos.x >= state.width || pos.y < 0 || pos.y >= state.height) return false;
  if (state.walls.some(wall => samePosition(wall, pos))) return false;
  if (state.snakes.some(snake => snake.segments.some(segment => samePosition(segment, pos)))) return false;
  return !state.foods.some(food =>
    food !== movingFood && food !== allowedFood && samePosition(food.pos, pos)
  );
}

function nearestDistance(pos: Position, targets: Position[]): number {
  return Math.min(...targets.map(target => chebyshevDistance(pos, target)));
}

function countNearbyHeads(pos: Position, heads: Position[], radius: number): number {
  return heads.filter(head => chebyshevDistance(pos, head) <= radius).length;
}

function getFarthestCandidates(candidates: Position[], heads: Position[]): Position[] {
  if (heads.length === 0) return candidates;
  const greatestDistance = Math.max(...candidates.map(candidate => nearestDistance(candidate, heads)));
  return candidates.filter(candidate => nearestDistance(candidate, heads) === greatestDistance);
}

function pickSafestCandidate(
  candidates: Position[],
  heads: Position[],
  ctx: EngineContext
): Position | null {
  return pickRandom(getFarthestCandidates(candidates, heads), ctx);
}

function pickRandom<T>(items: T[], ctx: EngineContext): T | null {
  if (items.length === 0) return null;
  return items[ctx.rng.nextInt(items.length)];
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
