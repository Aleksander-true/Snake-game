import { GameEngine } from '../src/engine/GameEngine';
import { EngineContext } from '../src/engine/context';
import { RandomPort } from '../src/engine/ports';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { RabbitEntity } from '../src/engine/entities/RabbitEntity';
import { applyDirection, getNextHeadPosition, moveSnake } from '../src/engine/systems/movementSystem';
import { collidesWithSnake, collidesWithWall, selfCollision } from '../src/engine/collision';
import { processHunger, resetHunger } from '../src/engine/systems/hungerSystem';
import { spawnRabbits } from '../src/engine/spawning/rabbitsSpawner';
import { generateWalls, validateWalls } from '../src/engine/spawning/wallsGenerator';
import {
  getCumulativeTargetScore,
  getInitialRabbitCount,
  getTargetScore,
  getWallClusterCount,
  getWallLength,
} from '../src/engine/formulas';
import { checkLevelComplete, getLevelWinner, getOverallWinner } from '../src/engine/systems/levelSystem';
import { GameState } from '../src/engine/types';
import { createEmptyBoard } from '../src/engine/board';

const testRng: RandomPort = {
  next: () => 0.5,
  nextInt: (max: number) => Math.floor(max / 2),
};

function createCtx(): EngineContext {
  return {
    settings: createDefaultSettings(),
    rng: testRng,
  };
}

function createState(width = 10, height = 10): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    rabbits: [],
    walls: [],
    level: 1,
    difficultyLevel: 1,
    tickCount: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

describe('Engine implemented behavior', () => {
  beforeEach(() => {
    resetSettings();
  });

  describe('Movement and direction', () => {
    test('getNextHeadPosition returns correct next cell for each direction', () => {
      const head = { x: 4, y: 4 };
      expect(getNextHeadPosition(head, 'up')).toEqual({ x: 4, y: 3 });
      expect(getNextHeadPosition(head, 'down')).toEqual({ x: 4, y: 5 });
      expect(getNextHeadPosition(head, 'left')).toEqual({ x: 3, y: 4 });
      expect(getNextHeadPosition(head, 'right')).toEqual({ x: 5, y: 4 });
    });

    test('moveSnake with grow=false moves head and removes tail', () => {
      const snake = new SnakeEntity(
        0,
        'P1',
        [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }],
        'right',
        false
      );
      moveSnake(snake, false);
      expect(snake.segments).toEqual([{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }]);
    });

    test('moveSnake with grow=true increases length by one', () => {
      const snake = new SnakeEntity(
        0,
        'P1',
        [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }],
        'right',
        false
      );
      moveSnake(snake, true);
      expect(snake.segments).toEqual([{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }]);
    });

    test('applyDirection blocks 180 degree turn and allows 90 degree turn', () => {
      const snake = new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 2, y: 3 }], 'right', false);
      applyDirection(snake, 'left');
      expect(snake.direction).toBe('right');
      applyDirection(snake, 'up');
      expect(snake.direction).toBe('up');
    });
  });

  describe('Collision checks', () => {
    test('collidesWithWall checks boundaries and explicit walls', () => {
      const state = createState(8, 8);
      state.walls = [{ x: 2, y: 2 }];
      expect(collidesWithWall({ x: -1, y: 0 }, state)).toBe(true);
      expect(collidesWithWall({ x: 8, y: 0 }, state)).toBe(true);
      expect(collidesWithWall({ x: 2, y: 2 }, state)).toBe(true);
      expect(collidesWithWall({ x: 1, y: 1 }, state)).toBe(false);
    });

    test('collidesWithSnake returns true for alive snakes and false for dead snakes', () => {
      const aliveSnake = new SnakeEntity(1, 'A', [{ x: 4, y: 4 }, { x: 4, y: 5 }], 'up', false);
      const deadSnake = new SnakeEntity(2, 'D', [{ x: 6, y: 6 }, { x: 6, y: 7 }], 'up', false);
      deadSnake.alive = false;
      expect(collidesWithSnake({ x: 4, y: 5 }, [aliveSnake])).toBe(true);
      expect(collidesWithSnake({ x: 6, y: 7 }, [deadSnake])).toBe(false);
    });

    test('selfCollision detects head overlap with body', () => {
      const snake = new SnakeEntity(
        1,
        'A',
        [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 3 }],
        'up',
        false
      );
      expect(selfCollision(snake)).toBe(true);
    });
  });

  describe('Hunger system', () => {
    test('processHunger increments counter before threshold and does not trim tail', () => {
      const ctx = createCtx();
      ctx.settings.hungerThreshold = 3;
      const snake = new SnakeEntity(0, 'P1', [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }], 'right', false);
      snake.ticksWithoutFood = 1;

      const dead = processHunger(snake, ctx);
      expect(dead).toBe(false);
      expect(snake.ticksWithoutFood).toBe(2);
      expect(snake.segments.length).toBe(3);
    });

    test('processHunger trims tail on threshold and kills on min length breach', () => {
      const ctx = createCtx();
      ctx.settings.hungerThreshold = 2;
      ctx.settings.minSnakeLength = 2;
      const snake = new SnakeEntity(0, 'P1', [{ x: 4, y: 4 }, { x: 3, y: 4 }], 'right', false);
      snake.ticksWithoutFood = 1;

      const dead = processHunger(snake, ctx);
      expect(dead).toBe(true);
      expect(snake.alive).toBe(false);
      expect(snake.deathReason).toBe('Умерла с голоду');
    });

    test('resetHunger sets ticksWithoutFood to zero', () => {
      const snake = new SnakeEntity(0, 'P1', [{ x: 2, y: 2 }, { x: 1, y: 2 }], 'right', false);
      snake.ticksWithoutFood = 7;
      resetHunger(snake);
      expect(snake.ticksWithoutFood).toBe(0);
    });
  });

  describe('Spawning and walls', () => {
    test('spawnRabbits respects walls/snakes/bounds and initializes rabbit fields', () => {
      let seq = 0;
      const spawningCtx: EngineContext = {
        settings: createDefaultSettings(),
        rng: {
          next: () => 0.5,
          nextInt: (max: number) => {
            const value = seq % max;
            seq++;
            return value;
          },
        },
      };
      const state = createState(12, 12);
      state.walls = [{ x: 6, y: 6 }];
      state.snakes = [
        new SnakeEntity(0, 'P1', [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }], 'down', false),
      ];

      const rabbits = spawnRabbits(6, state, spawningCtx);
      expect(rabbits.length).toBe(6);
      for (const rabbit of rabbits) {
        expect(rabbit.age).toBe(0);
        expect(rabbit.clockNum).toBe(0);
        expect(rabbit.reproductionCount).toBe(0);
        expect(rabbit.pos.x).toBeGreaterThanOrEqual(0);
        expect(rabbit.pos.x).toBeLessThan(state.width);
        expect(rabbit.pos.y).toBeGreaterThanOrEqual(0);
        expect(rabbit.pos.y).toBeLessThan(state.height);
        expect(state.walls.some(w => w.x === rabbit.pos.x && w.y === rabbit.pos.y)).toBe(false);
        expect(state.snakes[0].segments.some(s => s.x === rabbit.pos.x && s.y === rabbit.pos.y)).toBe(false);
      }
      for (let i = 0; i < rabbits.length; i++) {
        for (let j = i + 1; j < rabbits.length; j++) {
          const dx = Math.abs(rabbits[i].pos.x - rabbits[j].pos.x);
          const dy = Math.abs(rabbits[i].pos.y - rabbits[j].pos.y);
          expect(Math.max(dx, dy)).toBeGreaterThan(1);
        }
      }
    });

    test('validateWalls returns true for empty walls and false for isolating barrier', () => {
      expect(validateWalls([], 5, 5)).toBe(true);
      const barrier = [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 2, y: 4 },
      ];
      expect(validateWalls(barrier, 5, 5)).toBe(false);
    });

    test('generateWalls returns connected result and respects exclusion zones', () => {
      const ctx = createCtx();
      ctx.settings.initialSnakeLength = 4;
      const exclusion = [{ x: 10, y: 10 }];
      const safeRadius = Math.ceil(1.5 * ctx.settings.initialSnakeLength);

      const walls = generateWalls(30, 30, 3, 6, exclusion, ctx);
      expect(validateWalls(walls, 30, 30)).toBe(true);
      for (const wall of walls) {
        const distance = Math.max(Math.abs(wall.x - exclusion[0].x), Math.abs(wall.y - exclusion[0].y));
        expect(distance).toBeGreaterThan(safeRadius);
      }
    });
  });

  describe('Formulas', () => {
    test('formula helpers use floor and expected coefficients', () => {
      const settings = createDefaultSettings();
      expect(getTargetScore(1, settings)).toBe(Math.floor(settings.targetScoreCoeff * 1 + settings.targetScoreBase));
      expect(getCumulativeTargetScore(3, settings)).toBe(
        getTargetScore(1, settings) + getTargetScore(2, settings) + getTargetScore(3, settings)
      );
      expect(getInitialRabbitCount(2, 3, settings)).toBe(
        Math.floor(settings.rabbitCountPerSnakeCoeff * 2 + (settings.rabbitCountBase - 3))
      );
      expect(getWallClusterCount(3, settings)).toBe(
        Math.floor(settings.wallClusterCoeff * 3 + settings.wallClusterBase)
      );
      expect(getWallLength(5, settings)).toBe(
        Math.floor(settings.wallLengthCoeff * 5 + settings.wallLengthBase)
      );
    });
  });

  describe('Level completion and winner logic', () => {
    test('checkLevelComplete works for single player target/death and multiplayer conditions', () => {
      const ctx = createCtx();
      const single = createState();
      const oneSnake = new SnakeEntity(0, 'P1', [{ x: 1, y: 1 }, { x: 0, y: 1 }], 'right', false);
      single.snakes = [oneSnake];
      oneSnake.score = getCumulativeTargetScore(single.level, ctx.settings);
      expect(checkLevelComplete(single, ctx)).toBe(true);

      oneSnake.score = 0;
      oneSnake.alive = false;
      expect(checkLevelComplete(single, ctx)).toBe(true);

      const multi = createState();
      const s1 = new SnakeEntity(1, 'A', [{ x: 1, y: 1 }, { x: 1, y: 2 }], 'up', false);
      const s2 = new SnakeEntity(2, 'B', [{ x: 3, y: 1 }, { x: 3, y: 2 }], 'up', false);
      multi.snakes = [s1, s2];
      expect(checkLevelComplete(multi, ctx)).toBe(false);
      s2.alive = false;
      expect(checkLevelComplete(multi, ctx)).toBe(true);
      s2.alive = true;
      multi.levelTimeLeft = 0;
      expect(checkLevelComplete(multi, ctx)).toBe(true);
    });

    test('winner selection returns expected values', () => {
      const s1 = new SnakeEntity(1, 'A', [{ x: 1, y: 1 }, { x: 1, y: 2 }], 'up', false);
      const s2 = new SnakeEntity(2, 'B', [{ x: 3, y: 1 }, { x: 3, y: 2 }], 'up', false);
      const state = createState();
      state.snakes = [s1, s2];
      s2.alive = false;
      expect(getLevelWinner(state)).toBe(1);

      s1.levelsWon = 1;
      s1.score = 5;
      s2.levelsWon = 1;
      s2.score = 10;
      expect(getOverallWinner([s1, s2])?.id).toBe(2);
      s2.score = 5;
      expect(getOverallWinner([s1, s2])).toBeNull();
    });
  });

  describe('processTick integration', () => {
    test('processTick increments tick and moves snake one cell', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const state = createState();
      state.snakes = [
        new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }], 'right', false),
      ];
      const beforeHead = { ...state.snakes[0].segments[0] };

      engine.processTick(state);
      expect(state.tickCount).toBe(1);
      expect(state.snakes[0].segments[0]).toEqual({ x: beforeHead.x + 1, y: beforeHead.y });
    });

    test('processTick kills snake on wall collision with correct reason', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const state = createState(5, 5);
      state.snakes = [new SnakeEntity(0, 'P1', [{ x: 4, y: 2 }, { x: 3, y: 2 }], 'right', false)];

      const result = engine.processTick(state);
      expect(state.snakes[0].alive).toBe(false);
      expect(state.snakes[0].deathReason).toBe('Врезалась в стену');
      expect(result.events.some(event => event.type === 'SNAKE_DIED')).toBe(true);
    });

    test('processTick handles rabbit eating (growth, score, rabbit removal)', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const state = createState(8, 8);
      const snake = new SnakeEntity(0, 'P1', [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }], 'right', false);
      snake.ticksWithoutFood = 10;
      state.snakes = [snake];
      state.rabbits = [RabbitEntity.newborn({ x: 3, y: 2 })];

      const beforeLen = snake.segments.length;
      engine.processTick(state);
      expect(snake.score).toBe(1);
      expect(snake.segments.length).toBe(beforeLen + 1);
      expect(state.rabbits.length).toBe(0);
    });

    test('moving into own tail cell is allowed when tail moves away', () => {
      const ctx = createCtx();
      const engine = new GameEngine(ctx);
      const state = createState(10, 10);
      state.snakes = [
        new SnakeEntity(
          0,
          'P1',
          [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }],
          'right',
          false
        ),
      ];

      engine.processTick(state);
      expect(state.snakes[0].alive).toBe(true);
      expect(state.snakes[0].deathReason).toBeUndefined();
    });
  });
});
