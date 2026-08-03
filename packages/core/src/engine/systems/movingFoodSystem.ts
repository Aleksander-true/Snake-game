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
  const otherChickenPositions = state.foods
    .filter(food => food.kind === 'chicken' && food !== chicken)
    .map(food => food.pos);
  const neighbors = getNeighborPositions(chicken.pos);
  const livingHeads = state.snakes.filter(snake => snake.alive).map(snake => snake.head);
  const currentOvercrowding = getDensity(
    chicken.pos,
    otherChickenPositions,
    ctx.settings.chickenOvercrowdingRadius
  );
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
  } else if (currentOvercrowding.count > 0) {
    const safeCandidates = getSnakeSafeCandidates(
      candidates,
      livingHeads,
      currentSnakeDistance,
      ctx.settings.chickenAdultSafetyRadius
    );
    const improvingCandidates = safeCandidates.filter(candidate => {
      const candidateDensity = getDensity(
        candidate,
        otherChickenPositions,
        ctx.settings.chickenOvercrowdingRadius
      );
      return candidateDensity.count < currentOvercrowding.count
        || (
          candidateDensity.count === currentOvercrowding.count
          && candidateDensity.nearestDistance > currentOvercrowding.nearestDistance
        );
    });
    target = pickLowestChickenDensityCandidate(
      improvingCandidates.length > 0 ? improvingCandidates : safeCandidates,
      otherChickenPositions,
      livingHeads,
      ctx
    );
  } else if (apples.length > 0) {
    const safeCandidates = getSnakeSafeCandidates(
      candidates,
      livingHeads,
      currentSnakeDistance,
      ctx.settings.chickenAdultSafetyRadius
    );
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
  chicken.age = Math.max(
    ctx.settings.foodAdultAge,
    chicken.age - ctx.settings.chickenAppleAgeReduction
  );
  chicken.reproductionCount = Math.max(
    0,
    chicken.reproductionCount - ctx.settings.chickenAppleReproductionReduction
  );
  chicken.movementClock = 0;
  chicken.pendingMandatoryEgg = false;
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

function getSnakeSafeCandidates(
  candidates: Position[],
  livingHeads: Position[],
  currentSnakeDistance: number,
  safetyRadius: number
): Position[] {
  if (livingHeads.length === 0) return candidates;
  const requiredDistance = currentSnakeDistance < safetyRadius
    ? currentSnakeDistance
    : safetyRadius;
  const nonApproachingCandidates = candidates.filter(candidate =>
    nearestDistance(candidate, livingHeads) >= requiredDistance
  );
  return nonApproachingCandidates.length > 0
    ? nonApproachingCandidates
    : getFarthestCandidates(candidates, livingHeads);
}

function getDensity(
  pos: Position,
  otherChickenPositions: Position[],
  radius: number
): { count: number; nearestDistance: number } {
  const distances = otherChickenPositions.map(other => chebyshevDistance(pos, other));
  return {
    count: distances.filter(distance => distance <= radius).length,
    nearestDistance: distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY,
  };
}

function pickLowestChickenDensityCandidate(
  candidates: Position[],
  otherChickenPositions: Position[],
  livingHeads: Position[],
  ctx: EngineContext
): Position | null {
  const densities = candidates.map(candidate => ({
    candidate,
    ...getDensity(candidate, otherChickenPositions, ctx.settings.chickenOvercrowdingRadius),
  }));
  const minimumCount = Math.min(...densities.map(item => item.count));
  const leastCrowded = densities.filter(item => item.count === minimumCount);
  const greatestNearestDistance = Math.max(...leastCrowded.map(item => item.nearestDistance));
  const bestCandidates = leastCrowded
    .filter(item => item.nearestDistance === greatestNearestDistance)
    .map(item => item.candidate);
  return livingHeads.length > 0
    ? pickSafestCandidate(bestCandidates, livingHeads, ctx)
    : pickRandom(bestCandidates, ctx);
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
