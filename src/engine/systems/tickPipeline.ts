import { GameState, Snake } from '../types';
import { EngineContext } from '../context';
import { DomainEvent } from '../events';
import { buildBoard } from '../board';
import { moveSnake } from './movementSystem';
import { collidesWithWall, collidesWithSnake, selfCollision } from '../collision';
import { processHunger, resetHunger } from './hungerSystem';
import { awardRabbitPoints } from './scoringSystem';
import { processRabbitReproduction } from './rabbitsReproductionSystem';
import { checkLevelComplete } from './levelSystem';

/**
 * Run all tick systems in the required order.
 */
export function runTickPipeline(state: GameState, ctx: EngineContext, events: DomainEvent[]): void {
  movementSystem(state, events);
  hungerSystem(state, ctx, events);
  reproductionSystem(state, ctx, events);
  boardSystem(state);
  levelCheckSystem(state, ctx, events);
}

/* ---- System 1: Movement + collisions + eating ---- */
function movementSystem(state: GameState, events: DomainEvent[]): void {
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

    const rabbitIndex = state.rabbits.findIndex(
      rabbit => rabbit.pos.x === nextHeadPosition.x && rabbit.pos.y === nextHeadPosition.y
    );
    const hasEatenRabbit = rabbitIndex !== -1;

    moveSnake(snake, hasEatenRabbit);

    if (selfCollision(snake)) {
      markSnakeDead(snake, 'Съела саму себя', events);
      continue;
    }

    if (hasEatenRabbit) {
      const eatenRabbitPosition = state.rabbits[rabbitIndex].pos;
      state.rabbits.splice(rabbitIndex, 1);
      awardRabbitPoints(snake);
      resetHunger(snake);
      events.push({
        type: 'RABBIT_EATEN',
        snakeId: snake.id,
        pos: eatenRabbitPosition,
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
