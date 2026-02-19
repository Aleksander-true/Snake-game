import { GameState, Snake } from '../types';
import { EngineContext } from '../context';
import { DomainEvent } from '../events';
import { buildBoard } from '../board';
import { moveSnake } from './movementSystem';
import { collidesWithWall, collidesWithSnake, selfCollision } from '../collision';
import { processHunger, resetHunger } from './hungerSystem';
import { awardFoodPoints } from './scoringSystem';
import { processRabbitReproduction } from './rabbitsReproductionSystem';
import { checkLevelComplete } from './levelSystem';
import { autoReplenishFood, getFoodReward, syncLegacyFoodAlias } from './foodSystem';

/**
 * Run all tick systems in the required order.
 */
export function runTickPipeline(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  movementSystem(state, ctx, events);
  hungerSystem(state, ctx, events);
  reproductionSystem(state, ctx, events);
  boardSystem(state);
  levelCheckSystem(state, ctx, events);
}

/* ---- System 1: Movement + collisions + eating ---- */
function movementSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  for (const snake of state.snakes) {
    if (!snake.alive) continue;

    const nextHeadPosition = snake.getNextHeadPosition();

    if (collidesWithWall(nextHeadPosition, state)) {
      markSnakeDead(snake, 'Врезалась в стену', events);
      continue;
    }

    // "Collision with other snakes" must not include the snake itself.
    // Self-collision is checked later, after movement, per tick order.
    if (collidesWithSnake(nextHeadPosition, state.snakes.filter(otherSnake => otherSnake.id !== snake.id))) {
      markSnakeDead(snake, 'Столкнулась с другой змейкой', events);
      continue;
    }

    const foodIndex = state.foods.findIndex(
      food => food.pos.x === nextHeadPosition.x && food.pos.y === nextHeadPosition.y
    );
    const eatenFood = foodIndex !== -1 ? state.foods[foodIndex] : null;
    const growth = eatenFood ? getFoodReward(eatenFood, ctx.settings).growth : 0;
    const hasEatenFood = growth > 0;

    moveSnake(snake, hasEatenFood);
    if (growth > 1) {
      const tail = snake.segments[snake.segments.length - 1];
      for (let growthStep = 1; growthStep < growth; growthStep++) {
        snake.segments.push({ ...tail });
      }
    }

    if (selfCollision(snake)) {
      markSnakeDead(snake, 'Съела саму себя', events);
      continue;
    }

    if (eatenFood) {
      const eatenFoodPosition = eatenFood.pos;
      const reward = getFoodReward(eatenFood, ctx.settings);
      state.foods.splice(foodIndex, 1);
      awardFoodPoints(snake, reward.points);
      resetHunger(snake);
      syncLegacyFoodAlias(state);
      events.push({
        type: 'RABBIT_EATEN',
        snakeId: snake.id,
        pos: eatenFoodPosition,
        newScore: snake.score,
      });
    }
  }
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

/* ---- System 3: Rabbit reproduction ---- */
function reproductionSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  const rabbitBirths = processRabbitReproduction(state, ctx);
  for (const birth of rabbitBirths) {
    events.push({
      type: 'RABBIT_BORN',
      parentPos: birth.parentPos,
      childPos: birth.child.pos,
    });
  }
  autoReplenishFood(state, ctx);
}

/* ---- System 4: Board rebuild ---- */
function boardSystem(state: GameState): void {
  state.board = buildBoard(state);
}

/* ---- System 5: Level completion check ---- */
function levelCheckSystem(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  if (!checkLevelComplete(state, ctx)) return;

  state.levelComplete = true;
  const aliveSnakes = state.snakes.filter(snake => snake.alive);

  if (state.snakes.length === 1) {
    const singleSnake = state.snakes[0];
    const reason = singleSnake.alive ? 'Цель достигнута' : 'Змейка погибла';
    if (!singleSnake.alive) {
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

  events.push({ type: 'LEVEL_COMPLETED', reason, winnerId });
}

function markSnakeDead(snake: Snake, reason: string, events: DomainEvent[]): void {
  snake.die(reason);
  events.push({ type: 'SNAKE_DIED', snakeId: snake.id, reason });
}
