import { Food, GameState, Position, Snake } from '../types';
import { EngineContext } from '../context';
import { DomainEvent } from '../events';
import { buildBoard } from '../board';
import { moveSnake } from './movementSystem';
import { collidesWithWall } from '../collision';
import { processHunger, resetHunger } from './hungerSystem';
import { awardFoodPoints } from './scoringSystem';
import { processFoodLifecycle } from './rabbitsReproductionSystem';
import { checkLevelComplete, getMaxLevel } from './levelSystem';
import { autoReplenishFood, getFoodReward } from './foodSystem';

/**
 * Run all tick systems in the required order.
 */
export function runTickPipeline(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  movementSystem(state, ctx, events);
  hungerSystem(state, ctx, events);
  reproductionSystem(state, ctx, events);
  boardSystem(state, ctx);
  levelCheckSystem(state, ctx, events);
}

/* ---- System 1: Movement + collisions + eating ---- */
function movementSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  const intents = state.snakes
    .filter(snake => snake.alive)
    .map(snake => createMoveIntent(snake, state.foods, ctx));
  const deathReasons = resolveMoveDeaths(intents, state);

  for (const intent of intents) {
    const deathReason = deathReasons.get(intent.snake.id);
    if (deathReason) {
      markSnakeDead(intent.snake, deathReason, events);
      continue;
    }
    applyMoveIntent(intent, state, ctx, events);
  }
}

interface MoveIntent {
  snake: Snake;
  nextHead: Position;
  eatenFood: Food | null;
  growth: number;
  projectedBody: Position[];
}

function createMoveIntent(snake: Snake, foods: Food[], ctx: EngineContext): MoveIntent {
  const nextHead = snake.getNextHeadPosition();
  const eatenFood = foods.find(food => samePosition(food.pos, nextHead)) ?? null;
  const growth = eatenFood ? getFoodReward(eatenFood, ctx.settings).growth : 0;
  const retainedBody = growth > 0 ? snake.segments : snake.segments.slice(0, -1);
  return {
    snake,
    nextHead,
    eatenFood,
    growth,
    projectedBody: [nextHead, ...retainedBody],
  };
}

function resolveMoveDeaths(intents: MoveIntent[], state: GameState): Map<number, string> {
  const deaths = new Map<number, string>();

  for (const intent of intents) {
    if (collidesWithWall(intent.nextHead, state)) {
      deaths.set(intent.snake.id, 'Врезалась в стену');
    }
  }

  for (const intent of intents) {
    if (deaths.has(intent.snake.id)) continue;
    const sameTarget = intents.some(other =>
      other.snake.id !== intent.snake.id && samePosition(other.nextHead, intent.nextHead)
    );
    const swappedHeads = intents.some(other =>
      other.snake.id !== intent.snake.id &&
      samePosition(intent.nextHead, other.snake.head) &&
      samePosition(other.nextHead, intent.snake.head)
    );
    if (sameTarget || swappedHeads) {
      deaths.set(intent.snake.id, 'Столкнулась с другой змейкой');
    }
  }

  for (const intent of intents) {
    if (deaths.has(intent.snake.id)) continue;
    const hitsOwnBody = intent.projectedBody.slice(1).some(segment => samePosition(segment, intent.nextHead));
    if (hitsOwnBody) {
      deaths.set(intent.snake.id, 'Съела саму себя');
      continue;
    }

    const hitsOtherBody = intents.some(other => {
      if (other.snake.id === intent.snake.id) return false;
      const body = deaths.has(other.snake.id) ? other.snake.segments : other.projectedBody.slice(1);
      return body.some(segment => samePosition(segment, intent.nextHead));
    });
    if (hitsOtherBody) {
      deaths.set(intent.snake.id, 'Столкнулась с другой змейкой');
    }
  }

  return deaths;
}

function applyMoveIntent(
  intent: MoveIntent,
  state: GameState,
  ctx: EngineContext,
  events: DomainEvent[]
): void {
  moveSnake(intent.snake, intent.growth > 0);
  if (intent.growth > 1) {
    const tail = intent.snake.segments[intent.snake.segments.length - 1];
    for (let growthStep = 1; growthStep < intent.growth; growthStep++) {
      intent.snake.segments.push({ ...tail });
    }
  }

  if (!intent.eatenFood) return;
  const foodIndex = state.foods.indexOf(intent.eatenFood);
  if (foodIndex === -1) return;
  const reward = getFoodReward(intent.eatenFood, ctx.settings);
  state.foods.splice(foodIndex, 1);
  awardFoodPoints(intent.snake, reward.points);
  resetHunger(intent.snake);
  events.push({
    type: 'FOOD_EATEN',
    snakeId: intent.snake.id,
    pos: { ...intent.eatenFood.pos },
    newScore: intent.snake.score,
  });
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

/* ---- System 2: Hunger ---- */
function hungerSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    const hasDiedFromHunger = processHunger(snake, ctx);
    if (hasDiedFromHunger) {
      events.push({ type: 'SNAKE_DIED', snakeId: snake.id, reason: 'Умерла с голоду' });
    }
  }
}

/* ---- System 3: Food lifecycle/reproduction ---- */
function reproductionSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  const foodBirths = processFoodLifecycle(state, ctx);
  for (const birth of foodBirths) {
    events.push({
      type: 'FOOD_BORN',
      parentPos: birth.parentPos,
      childPos: birth.child.pos,
    });
  }
  autoReplenishFood(state, ctx);
}

/* ---- System 4: Board rebuild ---- */
function boardSystem(state: GameState, ctx: EngineContext): void {
  state.board = buildBoard(state, ctx.settings);
}

/* ---- System 5: Level completion check ---- */
function levelCheckSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  if (!checkLevelComplete(state, ctx)) return;

  state.levelComplete = true;
  const aliveSnakes = state.snakes.filter(snake => snake.alive);
  const maxLevel = getMaxLevel(state);
  const reachedLastLevel = state.level >= maxLevel;

  if (state.snakes.length === 1) {
    const singleSnake = state.snakes[0];
    const reason = !singleSnake.alive
      ? 'Змейка погибла'
      : reachedLastLevel
        ? (state.gameMode === 'survival' ? 'Выживание завершено: победа' : 'Последний уровень завершён')
        : 'Цель достигнута';
    if (!singleSnake.alive || reachedLastLevel) {
      state.gameOver = true;
      events.push({ type: 'GAME_OVER' });
    }
    events.push({ type: 'LEVEL_COMPLETED', reason });
    return;
  }

  let reason: string;
  let winnerId: number | undefined;
  if (aliveSnakes.length === 1) {
    reason = 'Последняя выжившая';
    winnerId = aliveSnakes[0].id;
    aliveSnakes[0].levelsWon++;
  } else if (aliveSnakes.length === 0) {
    reason = 'Все погибли';
  } else {
    reason = 'Время вышло';
  }

  if (reachedLastLevel) {
    state.gameOver = true;
    events.push({ type: 'GAME_OVER' });
  }
  events.push({ type: 'LEVEL_COMPLETED', reason, winnerId });
}

function markSnakeDead(snake: Snake, reason: string, events: DomainEvent[]): void {
  snake.die(reason);
  events.push({ type: 'SNAKE_DIED', snakeId: snake.id, reason });
}
