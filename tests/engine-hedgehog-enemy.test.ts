import {
  AppleFoodEntity,
  canHedgehogDetectPosition,
  createDefaultSettings,
  createEmptyBoard,
  createSeededRng,
  ensureHedgehogPopulation,
  GameEngine,
  getEnemyCells,
  getHedgehogExtraPercent,
  getHedgehogLevelPopulationPercent,
  getHedgehogMoveInterval,
  getHedgehogSpawnChancePerTick,
  HedgehogEntity,
  MeatFoodEntity,
  processEnemies,
  SnakeEntity,
  trySpawnHedgehogForTick,
} from '@snake-game/core';
import type { EngineContext, GameState, RandomPort } from '@snake-game/core';

function createState(level = 4, width = 30, height = 30): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    foods: [],
    enemies: [],
    nextFoodId: 0,
    nextEnemyId: 0,
    targetHedgehogCount: 0,
    roundResults: [],
    walls: [],
    level,
    difficultyLevel: 1,
    tickCount: 0,
    lastAutoFoodSpawnTick: 0,
    levelTimeLeft: 180,
    gameOver: false,
    levelComplete: false,
  };
}

function createContext(rng?: Partial<RandomPort>): EngineContext {
  return {
    settings: createDefaultSettings(),
    rng: {
      next: rng?.next ?? (() => 0),
      nextInt: rng?.nextInt ?? (() => 0),
    },
  };
}

describe('Hedgehog enemy', () => {
  test('calculates level population and spawns a two-by-two enemy safely on the border', () => {
    const settings = createDefaultSettings();
    expect(getHedgehogExtraPercent(1, settings)).toBe(0);
    expect(getHedgehogExtraPercent(3, settings)).toBe(60);
    expect(getHedgehogExtraPercent(7, settings)).toBe(120);
    expect(getHedgehogExtraPercent(10, settings)).toBe(165);
    expect(getHedgehogLevelPopulationPercent(4, settings)).toBe(80);
    expect(getHedgehogLevelPopulationPercent(5, settings)).toBe(100);
    expect(getHedgehogLevelPopulationPercent(10, settings)).toBe(200);
    expect(getHedgehogSpawnChancePerTick(3, 10, settings)).toBe(0);
    expect(getHedgehogSpawnChancePerTick(5, 3, settings)).toBe(0.016);
    expect(getHedgehogSpawnChancePerTick(5, 3, settings, 1)).toBe(0.008);
    expect(getHedgehogSpawnChancePerTick(5, 3, settings, 2)).toBe(0.004);
    expect(getHedgehogMoveInterval(1, settings)).toBe(4);
    expect(getHedgehogMoveInterval(3, settings)).toBe(4);
    expect(getHedgehogMoveInterval(4, settings)).toBe(3);
    expect(getHedgehogMoveInterval(7, settings)).toBe(3);
    expect(getHedgehogMoveInterval(8, settings)).toBe(2);
    expect(getHedgehogMoveInterval(10, settings)).toBe(2);

    const state = createState();
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 15, y: 15 }], 'right', false)];
    state.targetHedgehogCount = 1;
    const spawned = ensureHedgehogPopulation(state, createContext({ next: () => 1 }));

    expect(spawned).toHaveLength(1);
    const enemy = spawned[0];
    expect(enemy.width).toBe(2);
    expect(enemy.height).toBe(2);
    expect(
      enemy.pos.x === 0
      || enemy.pos.y === 0
      || enemy.pos.x + enemy.width === state.width
      || enemy.pos.y + enemy.height === state.height
    ).toBe(true);
    expect(getEnemyCells(enemy)).toHaveLength(4);
    expect(getEnemyCells(enemy).every(cell =>
      Math.max(Math.abs(cell.x - 15), Math.abs(cell.y - 15)) > 10
    )).toBe(true);
  });

  test('rolls hedgehog spawning on every game tick', () => {
    const state = createState(5);
    state.difficultyLevel = 3;
    state.tickCount = 1;

    expect(trySpawnHedgehogForTick(
      state,
      createContext({ next: () => 0.016 })
    )).toBeNull();
    expect(trySpawnHedgehogForTick(
      state,
      createContext({ next: () => 0.015999 })
    )).not.toBeNull();
    expect(state.enemies).toHaveLength(1);

    const lateState = createState(5);
    lateState.difficultyLevel = 3;
    lateState.tickCount = 101;
    expect(trySpawnHedgehogForTick(
      lateState,
      createContext({ next: () => 0 })
    )).not.toBeNull();
  });

  test('uses directional snake vision radii', () => {
    const settings = createDefaultSettings();
    const enemy = new HedgehogEntity('enemy-0', { x: 10, y: 10 }, 2, 2, 'right');

    expect(canHedgehogDetectPosition(enemy, { x: 31, y: 10 }, settings)).toBe(true);
    expect(canHedgehogDetectPosition(enemy, { x: 32, y: 10 }, settings)).toBe(false);
    expect(canHedgehogDetectPosition(enemy, { x: 5, y: 10 }, settings)).toBe(true);
    expect(canHedgehogDetectPosition(enemy, { x: 4, y: 10 }, settings)).toBe(false);
    expect(canHedgehogDetectPosition(enemy, { x: 10, y: 5 }, settings)).toBe(true);
    expect(canHedgehogDetectPosition(enemy, { x: 10, y: 4 }, settings)).toBe(false);
    expect(canHedgehogDetectPosition(enemy, { x: 10, y: 31 }, settings)).toBe(true);
    expect(canHedgehogDetectPosition(enemy, { x: 10, y: 32 }, settings)).toBe(false);
  });

  test('turns before moving at the difficulty-based cadence', () => {
    const state = createState();
    const enemy = new HedgehogEntity('enemy-0', { x: 10, y: 10 }, 2, 2, 'left');
    const meat = MeatFoodEntity.newborn({ x: 12, y: 10 }, 'food-0');
    const apple = AppleFoodEntity.newborn({ x: 18, y: 10 }, 0, 'food-1');
    state.enemies = [enemy];
    state.targetHedgehogCount = 1;
    state.foods = [meat, apple];
    const ctx = createContext();

    processEnemies(state, ctx, []);
    processEnemies(state, ctx, []);

    expect(enemy.pos).toEqual({ x: 10, y: 10 });
    expect(enemy.plannedMove).toBeUndefined();

    processEnemies(state, ctx, []);

    expect(enemy.pos).toEqual({ x: 10, y: 10 });
    expect(enemy.plannedMove).toEqual({ x: 11, y: 9 });
    expect(enemy.facing).toBe('right');

    processEnemies(state, ctx, []);

    expect(enemy.pos).toEqual({ x: 11, y: 9 });
    expect(enemy.plannedMove).toBeUndefined();
    expect(state.foods).not.toContain(meat);

    apple.pos = { x: 13, y: 9 };
    processEnemies(state, ctx, []);
    processEnemies(state, ctx, []);
    processEnemies(state, ctx, []);
    processEnemies(state, ctx, []);
    expect(state.foods).not.toContain(apple);
  });

  test('kills a snake whose head moves into the enemy footprint', () => {
    const ctx: EngineContext = {
      settings: createDefaultSettings(),
      rng: createSeededRng(3),
    };
    const engine = new GameEngine(ctx);
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'P1',
      [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }],
      'right',
      false
    );
    state.snakes = [snake];
    state.enemies = [new HedgehogEntity('enemy-0', { x: 6, y: 5 }, 2, 2, 'left')];
    state.targetHedgehogCount = 1;

    const result = engine.processTick(state);

    expect(snake.alive).toBe(false);
    expect(snake.deathReason).toBe('Столкнулась с ёжиком');
    expect(result.events).toContainEqual({
      type: 'SNAKE_DIED',
      snakeId: 0,
      reason: 'Столкнулась с ёжиком',
    });
    expect(state.foods.some(food => food.kind === 'meat')).toBe(true);
  });

  test('kills a snake on overlap and immediately consumes meat dropped beneath it', () => {
    const ctx: EngineContext = {
      settings: createDefaultSettings(),
      rng: createSeededRng(7),
    };
    const engine = new GameEngine(ctx);
    const state = createState();
    state.difficultyLevel = 8;
    const snake = new SnakeEntity(
      0,
      'P1',
      [{ x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 }],
      'right',
      false
    );
    snake.movementPaused = true;
    state.snakes = [snake];
    state.enemies = [new HedgehogEntity('enemy-0', { x: 5, y: 5 }, 2, 2, 'right')];
    state.targetHedgehogCount = 1;

    engine.processTick(state);
    const result = engine.processTick(state);

    expect(snake.alive).toBe(false);
    expect(snake.deathReason).toBe('Столкнулась с ёжиком');
    expect(result.events).toContainEqual({
      type: 'SNAKE_DIED',
      snakeId: 0,
      reason: 'Столкнулась с ёжиком',
    });
    expect(state.foods.filter(food => food.kind === 'meat')).toHaveLength(0);
  });
});
