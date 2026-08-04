import { createDefaultSettings, createEmptyBoard, GameEngine, resetSettings, SnakeEntity } from '@snake-game/core';
import type { EngineContext, GameConfig, GameState, RandomPort } from '@snake-game/core';
import { InputApplicationService } from '../src/app/services/InputApplicationService';

function createCtx(): EngineContext {
  const rng: RandomPort = {
    next: () => 0.5,
    nextInt: (max: number) => Math.floor(max / 2),
  };
  return {
    settings: createDefaultSettings(),
    rng,
  };
}

function createState(width = 12, height = 12): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    foods: [],
    enemies: [],
    nextEnemyId: 0,
    targetHedgehogCount: 0,
    roundResults: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

function createTwoPlayerConfig(): GameConfig {
  return {
    playerCount: 2,
    botCount: 0,
    playerNames: ['Игрок 1', 'Игрок 2'],
    difficultyLevel: 1,
  };
}

describe('Board integration - multiplayer and edge cases', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('mixed mode initializes and advances one human with two bots', () => {
    const ctx = createCtx();
    ctx.settings.wallClusterCoeff = 0;
    ctx.settings.wallClusterBase = 0;
    const engine = new GameEngine(ctx);
    const inputService = new InputApplicationService();
    const config: GameConfig = {
      playerCount: 1,
      botCount: 2,
      playerNames: ['Игрок'],
      difficultyLevel: 5,
    };
    const state = engine.createGameState(config, 1);
    engine.initLevel(state, config);

    expect(state.snakes).toHaveLength(3);
    expect(state.snakes.map(snake => snake.isBot)).toEqual([false, true, true]);
    inputService.applyTickCommands(state, config, engine.getSettings(), {
      directions: ['up', null],
      directionQueues: [['up'], []],
    });
    engine.processTick(state);

    expect(state.tickCount).toBe(1);
    expect(state.snakes.filter(snake => snake.alive)).toHaveLength(3);
  });

  test('self-collision kills snake and body remains on board', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 4, y: 4 }, { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }],
      'up',
      false
    );
    state.snakes = [snake];

    const result = engine.processTick(state);
    expect(snake.alive).toBe(false);
    expect(snake.deathReason).toBe('Съела саму себя');
    expect(result.events.some(event => event.type === 'SNAKE_DIED' && event.reason === 'Съела саму себя')).toBe(true);

    expect(state.foods.filter(food => food.kind === 'meat')).toHaveLength(2);
    expect(state.board.flat().filter(cell => cell === '&x1')).toHaveLength(2);
    expect(state.board.flat().filter(cell => cell === '1')).toHaveLength(3);
  });

  test('collision with another snake kills mover and keeps board consistent', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState();
    const mover = new SnakeEntity(0, 'A', [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], 'right', false);
    const blocker = new SnakeEntity(1, 'B', [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }], 'up', false);
    state.snakes = [mover, blocker];

    const result = engine.processTick(state);
    expect(mover.alive).toBe(false);
    expect(mover.deathReason).toBe('Столкнулась с другой змейкой');
    expect(blocker.alive).toBe(true);
    expect(result.events.some(event => event.type === 'SNAKE_DIED' && event.snakeId === mover.id)).toBe(true);

    expect(state.foods.filter(food => food.kind === 'meat')).toHaveLength(1);
    expect(mover.segments.map(seg => state.board[seg.y][seg.x]).sort()).toEqual(['&x1', '1', '1'].sort());
    for (const seg of blocker.segments) {
      expect(state.board[seg.y][seg.x]).toBe('2');
    }
  });

  test('paused snake stays in place, remains collidable and continues hunger', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState();
    const paused = new SnakeEntity(
      0,
      'Disconnected',
      [{ x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 }],
      'up',
      false
    );
    paused.movementPaused = true;
    const mover = new SnakeEntity(
      1,
      'Connected',
      [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      'right',
      false
    );
    state.snakes = [paused, mover];

    engine.processTick(state);

    expect(paused.head).toEqual({ x: 6, y: 5 });
    expect(paused.ticksWithoutFood).toBe(1);
    expect(paused.alive).toBe(true);
    expect(mover.alive).toBe(false);
    expect(mover.deathReason).toBe('Столкнулась с другой змейкой');
  });

  test('multiplayer level completes with winner and increments levelsWon for survivor', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(8, 8);
    const survivor = new SnakeEntity(10, 'Survivor', [{ x: 2, y: 2 }, { x: 2, y: 3 }], 'right', false);
    const doomed = new SnakeEntity(11, 'Doomed', [{ x: 7, y: 4 }, { x: 6, y: 4 }], 'right', false);
    state.snakes = [survivor, doomed];

    const result = engine.processTick(state);
    expect(doomed.alive).toBe(false);
    expect(state.levelComplete).toBe(true);
    expect(survivor.levelsWon).toBe(1);

    const levelEvent = result.events.find(event => event.type === 'LEVEL_COMPLETED');
    expect(levelEvent && 'winnerId' in levelEvent ? levelEvent.winnerId : undefined).toBe(survivor.id);
  });

  test('multiplayer level completes by timer with no winner', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(20, 20);
    const s1 = new SnakeEntity(1, 'S1', [{ x: 5, y: 5 }, { x: 4, y: 5 }], 'right', false);
    const s2 = new SnakeEntity(2, 'S2', [{ x: 10, y: 10 }, { x: 9, y: 10 }], 'right', false);
    state.snakes = [s1, s2];
    state.levelTimeLeft = 0;

    const result = engine.processTick(state);
    expect(state.levelComplete).toBe(true);
    expect(s1.levelsWon).toBe(0);
    expect(s2.levelsWon).toBe(0);

    const levelEvent = result.events.find(event => event.type === 'LEVEL_COMPLETED');
    expect(levelEvent && 'reason' in levelEvent ? levelEvent.reason : '').toBe('Время вышло');
    expect(levelEvent && 'winnerId' in levelEvent ? levelEvent.winnerId : undefined).toBeUndefined();
  });

  test('two players are controlled simultaneously in one tick', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const inputService = new InputApplicationService();
    const state = createState(14, 14);
    const config = createTwoPlayerConfig();

    const player1 = new SnakeEntity(0, 'Игрок 1', [{ x: 3, y: 8 }, { x: 3, y: 9 }, { x: 3, y: 10 }], 'up', false);
    const player2 = new SnakeEntity(1, 'Игрок 2', [{ x: 10, y: 8 }, { x: 10, y: 7 }, { x: 10, y: 6 }], 'down', false);
    state.snakes = [player1, player2];

    inputService.applyTickCommands(state, config, ctx.settings, {
      directions: ['right', 'left'],
    });
    engine.processTick(state);

    expect(player1.direction).toBe('right');
    expect(player2.direction).toBe('left');
    expect(player1.head).toEqual({ x: 4, y: 8 });
    expect(player2.head).toEqual({ x: 9, y: 8 });
    expect(state.board[8][4]).toBe('1');
    expect(state.board[8][9]).toBe('2');
  });

  test('head-on collision after simultaneous control kills both players', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const inputService = new InputApplicationService();
    const state = createState(14, 14);
    const config = createTwoPlayerConfig();

    const player1 = new SnakeEntity(0, 'Игрок 1', [{ x: 6, y: 8 }, { x: 6, y: 9 }, { x: 6, y: 10 }], 'up', false);
    const player2 = new SnakeEntity(1, 'Игрок 2', [{ x: 8, y: 8 }, { x: 8, y: 7 }, { x: 8, y: 6 }], 'down', false);
    state.snakes = [player1, player2];

    // Tick 1: both players turn toward each other.
    inputService.applyTickCommands(state, config, ctx.settings, {
      directions: ['right', 'left'],
    });
    const tick1Result = engine.processTick(state);

    expect(player1.alive).toBe(false);
    expect(player2.alive).toBe(false);
    expect(player1.deathReason).toBe('Столкнулась с другой змейкой');
    expect(player2.deathReason).toBe('Столкнулась с другой змейкой');
    expect(tick1Result.events.some(event => event.type === 'SNAKE_DIED' && event.snakeId === player1.id)).toBe(true);
    expect(tick1Result.events.some(event => event.type === 'SNAKE_DIED' && event.snakeId === player2.id)).toBe(true);
  });

  test('moving into another snake tail is allowed when that tail leaves the cell', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(14, 14);
    const player1 = new SnakeEntity(0, 'Игрок 1', [{ x: 4, y: 5 }, { x: 4, y: 6 }], 'left', false);
    const player2 = new SnakeEntity(1, 'Игрок 2', [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }], 'up', false);
    state.snakes = [player1, player2];

    engine.processTick(state);

    expect(player1.alive).toBe(true);
    expect(player1.head).toEqual({ x: 3, y: 5 });
    expect(player2.alive).toBe(true);
    expect(player2.head).toEqual({ x: 3, y: 2 });
  });
});
