import { EngineContext } from '../context';
import { HedgehogEntity } from '../entities/HedgehogEntity';
import { DomainEvent } from '../events';
import { GameSettings } from '../settings';
import { Enemy, FoodFacing, GameState, Position, Snake } from '../types';

const MOVE_OFFSETS: ReadonlyArray<Position> = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 },                     { x: 1, y: 0 },
  { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 },
];

interface EnemyTarget {
  pos: Position;
}

/** Calculate the base number of hedgehogs for one game level. */
export function getBaseHedgehogCount(level: number, settings: GameSettings): number {
  if (level < settings.hedgehogSpawnStartLevel) return 0;
  return level < settings.hedgehogSecondSpawnStartLevel ? 1 : 2;
}

/** Calculate the percentage used for extra hedgehogs at one difficulty. */
export function getHedgehogExtraPercent(difficulty: number, settings: GameSettings): number {
  if (difficulty <= 1) return 0;
  return Math.max(
    0,
    settings.hedgehogExtraChanceSlope * difficulty + settings.hedgehogExtraChanceIntercept
  );
}

/** Roll the target hedgehog population once when a level starts. */
export function getTargetHedgehogCount(
  level: number,
  difficulty: number,
  ctx: EngineContext
): number {
  const baseCount = getBaseHedgehogCount(level, ctx.settings);
  if (baseCount === 0) return 0;

  const extraPercent = getHedgehogExtraPercent(difficulty, ctx.settings);
  const guaranteedExtra = Math.floor(extraPercent / 100);
  const remainder = (extraPercent % 100) / 100;
  const randomExtra = remainder > 0 && ctx.rng.next() < remainder ? 1 : 0;
  return baseCount + guaranteedExtra + randomExtra;
}

/** Spawn missing hedgehogs at valid border positions. */
export function ensureHedgehogPopulation(state: GameState, ctx: EngineContext): Enemy[] {
  const spawned: Enemy[] = [];
  while (
    state.enemies.filter(enemy => enemy.kind === 'hedgehog').length < state.targetHedgehogCount
  ) {
    const enemy = spawnHedgehog(state, ctx);
    if (!enemy) break;
    state.enemies.push(enemy);
    spawned.push(enemy);
  }
  return spawned;
}

/** Plan and execute hedgehog movement in stable id order. */
export function processEnemies(
  state: GameState,
  ctx: EngineContext,
  events: DomainEvent[]
): void {
  ensureHedgehogPopulation(state, ctx);
  const enemies = [...state.enemies].sort((left, right) => left.id.localeCompare(right.id));

  for (const enemy of enemies) {
    enemy.movementClock++;
    const interval = Math.max(1, ctx.settings.hedgehogMoveInterval);
    const planningTick = Math.max(1, interval - 1);

    if (!enemy.plannedMove && enemy.movementClock >= planningTick) {
      const plannedMove = chooseEnemyMove(enemy, state, ctx);
      if (plannedMove) {
        enemy.plannedMove = plannedMove;
        enemy.facing = getFacingForMove(enemy.pos, plannedMove);
      }
    }
    if (enemy.movementClock < interval) continue;

    enemy.movementClock = 0;
    const plannedMove = enemy.plannedMove;
    enemy.plannedMove = undefined;
    if (!plannedMove || !canOccupy(enemy, plannedMove, state)) continue;

    enemy.pos = { ...plannedMove };
    consumeTargetFood(enemy, state);
    killOverlappingSnakes(enemy, state.snakes, events);
  }
}

/** Remove meat created beneath enemies after snake death drops are processed. */
export function consumeMeatUnderEnemies(state: GameState): void {
  state.foods = state.foods.filter(food =>
    food.kind !== 'meat' || !state.enemies.some(enemy => enemyOccupiesPosition(enemy, food.pos))
  );
}

export function getEnemyCells(enemy: Enemy, pos: Position = enemy.pos): Position[] {
  const cells: Position[] = [];
  for (let offsetY = 0; offsetY < enemy.height; offsetY++) {
    for (let offsetX = 0; offsetX < enemy.width; offsetX++) {
      cells.push({ x: pos.x + offsetX, y: pos.y + offsetY });
    }
  }
  return cells;
}

export function enemyOccupiesPosition(enemy: Enemy, pos: Position): boolean {
  return pos.x >= enemy.pos.x
    && pos.x < enemy.pos.x + enemy.width
    && pos.y >= enemy.pos.y
    && pos.y < enemy.pos.y + enemy.height;
}

export function isPositionInsideEnemy(pos: Position, state: GameState): boolean {
  return state.enemies.some(enemy => enemyOccupiesPosition(enemy, pos));
}

/** Check the directional hedgehog vision rules for one target cell. */
export function canHedgehogDetectPosition(
  enemy: Enemy,
  target: Position,
  settings: GameSettings
): boolean {
  const distance = distanceFromArea(enemy, target);
  const right = enemy.pos.x + enemy.width - 1;
  const bottom = enemy.pos.y + enemy.height - 1;

  if (target.x < enemy.pos.x) {
    const radius = enemy.facing === 'left'
      ? settings.hedgehogFrontVisionRadius
      : settings.hedgehogRearVisionRadius;
    return distance <= radius;
  }
  if (target.x > right) {
    const radius = enemy.facing === 'right'
      ? settings.hedgehogFrontVisionRadius
      : settings.hedgehogRearVisionRadius;
    return distance <= radius;
  }
  if (target.y < enemy.pos.y) return distance <= settings.hedgehogAboveVisionRadius;
  if (target.y > bottom) return distance <= settings.hedgehogBelowVisionRadius;
  return true;
}

function spawnHedgehog(state: GameState, ctx: EngineContext): Enemy | null {
  const width = ctx.settings.hedgehogWidth;
  const height = ctx.settings.hedgehogHeight;
  const candidates: Position[] = [];

  for (let y = 0; y <= state.height - height; y++) {
    for (let x = 0; x <= state.width - width; x++) {
      const touchesBorder = x === 0
        || y === 0
        || x + width === state.width
        || y + height === state.height;
      if (!touchesBorder) continue;
      const candidate = { x, y };
      if (isValidSpawnArea(candidate, width, height, state, ctx.settings)) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) return null;
  const pos = candidates[ctx.rng.nextInt(candidates.length)];
  const nextId = state.nextEnemyId ?? 0;
  state.nextEnemyId = nextId + 1;
  return new HedgehogEntity(
    `enemy-${nextId}`,
    { ...pos },
    width,
    height,
    ctx.rng.next() < 0.5 ? 'left' : 'right'
  );
}

function isValidSpawnArea(
  pos: Position,
  width: number,
  height: number,
  state: GameState,
  settings: GameSettings
): boolean {
  const candidate = new HedgehogEntity('', pos, width, height, 'right');
  const cells = getEnemyCells(candidate);
  if (cells.some(cell => state.walls.some(wall => samePosition(wall, cell)))) return false;
  if (cells.some(cell => state.foods.some(food => samePosition(food.pos, cell)))) return false;
  if (cells.some(cell => state.enemies.some(enemy => enemyOccupiesPosition(enemy, cell)))) return false;
  if (cells.some(cell => state.snakes.some(snake =>
    snake.segments.some(segment => samePosition(segment, cell))
  ))) return false;

  return state.snakes
    .filter(snake => snake.alive)
    .every(snake => snake.segments.every(segment =>
      distanceFromCells(cells, segment) > settings.hedgehogSpawnSnakeDistance
    ));
}

function chooseEnemyMove(enemy: Enemy, state: GameState, ctx: EngineContext): Position | null {
  const candidates = MOVE_OFFSETS
    .map(offset => ({ x: enemy.pos.x + offset.x, y: enemy.pos.y + offset.y }))
    .filter(candidate => canOccupy(enemy, candidate, state));
  if (candidates.length === 0) return null;

  const target = findSnakeTarget(enemy, state, ctx.settings)
    ?? findFoodTarget(enemy, state, ctx.settings);
  if (!target) return candidates[ctx.rng.nextInt(candidates.length)];

  const bestDistance = Math.min(...candidates.map(candidate =>
    distanceFromArea(enemy, target.pos, candidate)
  ));
  const bestCandidates = candidates.filter(candidate =>
    distanceFromArea(enemy, target.pos, candidate) === bestDistance
  );
  return bestCandidates[ctx.rng.nextInt(bestCandidates.length)];
}

function findSnakeTarget(
  enemy: Enemy,
  state: GameState,
  settings: GameSettings
): EnemyTarget | null {
  const detected: Array<{ pos: Position; distance: number; snakeId: number; segmentIndex: number }> = [];
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    for (let segmentIndex = 0; segmentIndex < snake.segments.length; segmentIndex++) {
      const segment = snake.segments[segmentIndex];
      if (!canHedgehogDetectPosition(enemy, segment, settings)) continue;
      detected.push({
        pos: segment,
        distance: distanceFromArea(enemy, segment),
        snakeId: snake.id,
        segmentIndex,
      });
    }
  }
  detected.sort((left, right) =>
    left.distance - right.distance
    || left.snakeId - right.snakeId
    || left.segmentIndex - right.segmentIndex
  );
  return detected[0] ? { pos: detected[0].pos } : null;
}

function findFoodTarget(
  enemy: Enemy,
  state: GameState,
  settings: GameSettings
): EnemyTarget | null {
  const foods = state.foods
    .filter(food => food.kind === 'apple' || food.kind === 'meat')
    .map(food => ({ food, distance: distanceFromArea(enemy, food.pos) }))
    .filter(item => item.distance <= settings.hedgehogFoodVisionRadius)
    .sort((left, right) => left.distance - right.distance || left.food.id.localeCompare(right.food.id));
  return foods[0] ? { pos: foods[0].food.pos } : null;
}

function canOccupy(enemy: Enemy, pos: Position, state: GameState): boolean {
  const cells = getEnemyCells(enemy, pos);
  if (cells.some(cell =>
    cell.x < 0 || cell.x >= state.width || cell.y < 0 || cell.y >= state.height
  )) return false;
  if (cells.some(cell => state.walls.some(wall => samePosition(wall, cell)))) return false;
  if (cells.some(cell => state.enemies.some(other =>
    other !== enemy && enemyOccupiesPosition(other, cell)
  ))) return false;
  return !cells.some(cell => state.foods.some(food =>
    food.kind !== 'apple' && food.kind !== 'meat' && samePosition(food.pos, cell)
  ));
}

function consumeTargetFood(enemy: Enemy, state: GameState): void {
  state.foods = state.foods.filter(food =>
    (food.kind !== 'apple' && food.kind !== 'meat')
    || !enemyOccupiesPosition(enemy, food.pos)
  );
}

function killOverlappingSnakes(
  enemy: Enemy,
  snakes: Snake[],
  events: DomainEvent[]
): void {
  for (const snake of snakes) {
    if (!snake.alive) continue;
    if (!snake.segments.some(segment => enemyOccupiesPosition(enemy, segment))) continue;
    const reason = 'Столкнулась с ёжиком';
    snake.die(reason);
    events.push({ type: 'SNAKE_DIED', snakeId: snake.id, reason });
  }
}

function distanceFromArea(enemy: Enemy, target: Position, pos: Position = enemy.pos): number {
  const deltaX = target.x < pos.x
    ? pos.x - target.x
    : target.x >= pos.x + enemy.width ? target.x - (pos.x + enemy.width - 1) : 0;
  const deltaY = target.y < pos.y
    ? pos.y - target.y
    : target.y >= pos.y + enemy.height ? target.y - (pos.y + enemy.height - 1) : 0;
  return Math.max(deltaX, deltaY);
}

function distanceFromCells(cells: Position[], target: Position): number {
  return Math.min(...cells.map(cell =>
    Math.max(Math.abs(cell.x - target.x), Math.abs(cell.y - target.y))
  ));
}

function getFacingForMove(origin: Position, target: Position): FoodFacing {
  if (target.x > origin.x) return 'right';
  if (target.x < origin.x) return 'left';
  return target.y < origin.y ? 'right' : 'left';
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}
