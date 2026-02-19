import { GameEngine } from '../src/engine/GameEngine';
import { EngineContext } from '../src/engine/context';
import { RandomPort } from '../src/engine/ports';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { RabbitEntity } from '../src/engine/entities/RabbitEntity';
import { GameConfig, GameState } from '../src/engine/types';
import { createEmptyBoard } from '../src/engine/board';
import { InputApplicationService } from '../src/app/services/InputApplicationService';
import { validateWalls } from '../src/engine/spawning/wallsGenerator';

function createCyclingRng(): RandomPort {
  let counter = 0;
  return {
    next: () => {
      const seq = [0.11, 0.71, 0.33, 0.93, 0.25, 0.55];
      const value = seq[counter % seq.length];
      counter++;
      return value;
    },
    nextInt: (max: number) => {
      if (max <= 0) return 0;
      const value = (counter * 7 + 3) % max;
      counter++;
      return value;
    },
  };
}

function createCtx(): EngineContext {
  return {
    settings: createDefaultSettings(),
    rng: createCyclingRng(),
  };
}

function createState(width = 12, height = 12): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    foods: [],
    rabbits: [],
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

function countBoardCells(board: string[][], marker: string): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === marker) count++;
    }
  }
  return count;
}

describe('Board integration - single player mode', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('initLevel builds board with walls, rabbits and snake segments in correct cells', () => {
    const ctx = createCtx();
    ctx.settings.levelOverrides['1'] = { wallClusters: 3, wallLength: 5, rabbitCount: 8 };

    const engine = new GameEngine(ctx);
    const config: GameConfig = {
      playerCount: 1,
      botCount: 0,
      playerNames: ['Игрок 1'],
      difficultyLevel: 3,
    };
    const state = engine.createGameState(config, 1);
    engine.initLevel(state, config);

    expect(validateWalls(state.walls, state.width, state.height)).toBe(true);
    expect(state.rabbits.length).toBeGreaterThan(0);

    for (const wall of state.walls) {
      expect(state.board[wall.y][wall.x]).toBe('*');
    }
    for (const rabbit of state.rabbits) {
      expect(state.board[rabbit.pos.y][rabbit.pos.x]).toBe('&');
    }
    for (const seg of state.snakes[0].segments) {
      expect(state.board[seg.y][seg.x]).toBe('#');
    }

    expect(countBoardCells(state.board, '#')).toBe(state.snakes[0].segments.length);
  });

  test('turn commands affect next ticks and board reflects turning path', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const inputService = new InputApplicationService();
    const state = createState(14, 14);
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }],
      'right',
      false
    );
    state.snakes = [snake];

    const config: GameConfig = {
      playerCount: 1,
      botCount: 0,
      playerNames: ['Игрок 1'],
      difficultyLevel: 1,
    };

    inputService.applyTickCommands(state, config, ctx.settings, { directions: ['up', null] });
    engine.processTick(state);
    expect(state.snakes[0].segments[0]).toEqual({ x: 6, y: 5 });
    expect(state.board[5][6]).toBe('#');

    inputService.applyTickCommands(state, config, ctx.settings, { directions: ['left', null] });
    engine.processTick(state);
    expect(state.snakes[0].segments[0]).toEqual({ x: 5, y: 5 });
    expect(state.board[5][5]).toBe('#');
  });

  test('eating rabbit updates board, score and tail growth on same tick', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(12, 12);
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }],
      'right',
      false
    );
    snake.ticksWithoutFood = 9;
    state.snakes = [snake];
    state.foods = [RabbitEntity.newborn({ x: 5, y: 4 })];
    state.rabbits = state.foods;

    const lengthBefore = snake.segments.length;
    engine.processTick(state);

    expect(snake.score).toBe(1);
    expect(snake.segments.length).toBe(lengthBefore + 1);
    // Hunger is reset on eat, then incremented during hunger phase in the same tick.
    expect(snake.ticksWithoutFood).toBe(1);
    expect(state.foods.length).toBe(1);
    expect(state.board[4][5]).toBe('#');
    expect(countBoardCells(state.board, '&')).toBe(1);
    expect(countBoardCells(state.board, '#')).toBe(snake.segments.length);
  });

  test('dead snake body stays on board after collision with wall', () => {
    const ctx = createCtx();
    const engine = new GameEngine(ctx);
    const state = createState(6, 6);
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }],
      'right',
      false
    );
    state.snakes = [snake];

    engine.processTick(state);

    expect(snake.alive).toBe(false);
    expect(snake.deathReason).toBe('Врезалась в стену');
    expect(state.board[3][5]).toBe('#');
    expect(state.board[3][4]).toBe('#');
    expect(state.board[3][3]).toBe('#');
  });

  test('single-player level completes on reaching cumulative target score', () => {
    const ctx = createCtx();
    ctx.settings.targetScoreCoeff = 0;
    ctx.settings.targetScoreBase = 1;

    const engine = new GameEngine(ctx);
    const state = createState(10, 10);
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }],
      'right',
      false
    );
    state.snakes = [snake];
    state.foods = [RabbitEntity.newborn({ x: 3, y: 2 })];
    state.rabbits = state.foods;

    const result = engine.processTick(state);
    expect(state.levelComplete).toBe(true);
    expect(result.events.some(event => event.type === 'LEVEL_COMPLETED')).toBe(true);
  });

  test('mini simulation: commands, turns, hunger trim, rabbit eating and board consistency', () => {
    const ctx = createCtx();
    ctx.settings.hungerThreshold = 3;
    ctx.settings.minSnakeLength = 2;
    // Keep target unreachable in this scenario so ticks continue.
    ctx.settings.targetScoreCoeff = 0;
    ctx.settings.targetScoreBase = 99;

    const engine = new GameEngine(ctx);
    const inputService = new InputApplicationService();
    const state = createState(12, 12);
    const snake = new SnakeEntity(
      0,
      'Игрок 1',
      [{ x: 3, y: 6 }, { x: 2, y: 6 }, { x: 1, y: 6 }, { x: 0, y: 6 }],
      'right',
      false
    );
    state.snakes = [snake];
    state.foods = [
      RabbitEntity.newborn({ x: 4, y: 6 }),
      RabbitEntity.newborn({ x: 4, y: 3 }),
    ];
    state.rabbits = state.foods;

    // Tick 1: move right, eat first rabbit.
    engine.processTick(state);
    expect(snake.segments[0]).toEqual({ x: 4, y: 6 });
    expect(snake.score).toBe(1);
    expect(snake.segments.length).toBe(5);
    expect(snake.ticksWithoutFood).toBe(1);
    expect(state.board[6][4]).toBe('#');
    expect(state.foods.some(r => r.pos.x === 4 && r.pos.y === 6)).toBe(false);

    // Tick 2: command up, should turn and move up.
    inputService.applyTickCommands(
      state,
      { playerCount: 1, botCount: 0, playerNames: ['Игрок 1'], difficultyLevel: 1 },
      ctx.settings,
      { directions: ['up', null] }
    );
    engine.processTick(state);
    expect(snake.segments[0]).toEqual({ x: 4, y: 5 });
    expect(snake.direction).toBe('up');
    expect(snake.ticksWithoutFood).toBe(2);
    expect(state.board[5][4]).toBe('#');

    // Tick 3: continue up, no rabbit, hunger threshold reached -> tail trimmed.
    const lenBeforeTrim = snake.segments.length;
    engine.processTick(state);
    expect(snake.segments[0]).toEqual({ x: 4, y: 4 });
    expect(snake.segments.length).toBe(lenBeforeTrim - 1);
    expect(snake.ticksWithoutFood).toBe(0);
    expect(countBoardCells(state.board, '#')).toBe(snake.segments.length);

    // Tick 4: continue up, eat second rabbit.
    const lenBeforeSecondEat = snake.segments.length;
    engine.processTick(state);
    expect(snake.segments[0]).toEqual({ x: 4, y: 3 });
    expect(snake.score).toBe(2);
    expect(snake.segments.length).toBe(lenBeforeSecondEat + 1);
    expect(snake.ticksWithoutFood).toBe(1);
    expect(state.foods.some(r => r.pos.x === 4 && r.pos.y === 3)).toBe(false);
    expect(countBoardCells(state.board, '&')).toBe(1);
    expect(countBoardCells(state.board, '#')).toBe(snake.segments.length);
    expect(state.levelComplete).toBe(false);
  });
});
