import {
  AppleFoodEntity,
  buildBoard,
  ChickenFoodEntity,
  createDefaultSettings,
  createEmptyBoard,
  getFoodReward,
  getPeriodicChickenSpawnProbability,
  processFoodLifecycle,
  processMovingFood,
  SnakeEntity,
  spawnPeriodicFood,
  spawnFood,
} from '@snake-game/core';
import type { EngineContext, GameState, RandomPort } from '@snake-game/core';

function createState(level = 2, width = 20, height = 20): GameState {
  return {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    foods: [],
    nextFoodId: 0,
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

describe('Chicken food', () => {
  test('regular spawn uses only apples on level 1 and seeded chicken chance from level 2', () => {
    const ctx = createContext();
    const levelOne = createState(1);
    const levelTwo = createState(2);

    expect(spawnFood(1, levelOne, ctx)[0].kind).toBe('apple');
    const chicken = spawnFood(1, levelTwo, ctx)[0];
    expect(chicken.kind).toBe('chicken');
    expect(chicken.age).toBe(0);
    expect(chicken.id).toBe('food-0');
  });

  test('periodic chicken probability grows linearly with excess apples', () => {
    const settings = createDefaultSettings();

    expect(getPeriodicChickenSpawnProbability(20, 1, 1, settings)).toBe(0);
    expect(getPeriodicChickenSpawnProbability(4, 2, 2, settings)).toBe(0.3);
    expect(getPeriodicChickenSpawnProbability(5, 2, 2, settings)).toBe(0.6);
    expect(getPeriodicChickenSpawnProbability(12, 2, 2, settings)).toBeCloseTo(0.7867, 4);
    expect(getPeriodicChickenSpawnProbability(20, 2, 2, settings)).toBe(1);
    expect(getPeriodicChickenSpawnProbability(10, 6, 2, settings)).toBe(0.3);
    expect(getPeriodicChickenSpawnProbability(11, 6, 2, settings)).toBe(0.6);
  });

  test('periodic food is guaranteed every one hundred ticks regardless of food count', () => {
    const ctx = createContext({ next: () => 0.99 });
    const state = createState(2, 30, 30);
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 15, y: 15 }], 'right', false)];
    state.foods = Array.from({ length: 21 }, (_, index) =>
      AppleFoodEntity.newborn({ x: index, y: 1 }, 0, `food-${index}`)
    );
    state.nextFoodId = 21;

    state.tickCount = 99;
    spawnPeriodicFood(state, ctx);
    expect(state.foods).toHaveLength(21);

    state.tickCount = 100;
    spawnPeriodicFood(state, ctx);
    expect(state.foods).toHaveLength(22);
    expect(state.foods[21].kind).toBe('chicken');
    expect(state.foods[21].id).toBe('food-21');
  });

  test('egg, chick and adult rewards come from JSON-backed settings', () => {
    const settings = createDefaultSettings();
    const chicken = ChickenFoodEntity.newborn({ x: 5, y: 5 });

    expect(getFoodReward(chicken, settings)).toEqual({ points: 1, growth: 1 });
    chicken.age = settings.foodYoungAge;
    expect(getFoodReward(chicken, settings)).toEqual({ points: 2, growth: 2 });
    chicken.age = settings.foodAdultAge;
    expect(getFoodReward(chicken, settings)).toEqual({ points: 3, growth: 3 });

    const state = createState();
    state.foods = [chicken];
    state.board = buildBoard(state, settings);
    expect(state.board[chicken.pos.y][chicken.pos.x]).toBe('&x3');
  });

  test('chick moves every three opportunities and remains near its egg origin', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = ChickenFoodEntity.newborn({ x: 10, y: 10 }, 'food-0');
    chicken.age = ctx.settings.foodYoungAge + 1;
    state.foods = [chicken];

    processMovingFood(state, ctx);
    processMovingFood(state, ctx);
    expect(chicken.pos).toEqual({ x: 10, y: 10 });
    processMovingFood(state, ctx);

    expect(chicken.pos).not.toEqual({ x: 10, y: 10 });
    expect(Math.max(Math.abs(chicken.pos.x - 10), Math.abs(chicken.pos.y - 10))).toBeLessThanOrEqual(5);
  });

  test('adult apple consumption reduces age and reproduction count without mandatory egg', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 25,
      10,
      2,
      { x: 2, y: 2 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    const apple = AppleFoodEntity.newborn({ x: 9, y: 9 }, 0, 'food-1');
    state.foods = [chicken, apple];
    state.nextFoodId = 2;

    processMovingFood(state, ctx);

    expect(chicken.pos).toEqual({ x: 9, y: 9 });
    expect(chicken.age).toBe(ctx.settings.foodAdultAge + 15);
    expect(chicken.clockNum).toBe(10);
    expect(chicken.reproductionCount).toBe(1);
    expect(chicken.pendingMandatoryEgg).toBe(false);
    expect(state.foods).not.toContain(apple);
    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);

    chicken.age = ctx.settings.foodAdultAge;
    chicken.reproductionCount = 0;
    chicken.movementClock = ctx.settings.chickenAdultMoveInterval - 1;
    state.foods.push(AppleFoodEntity.newborn({ x: 8, y: 8 }, 0, 'food-2'));
    processMovingFood(state, ctx);
    expect(chicken.age).toBe(ctx.settings.foodAdultAge);
    expect(chicken.reproductionCount).toBe(0);
  });

  test('adult moves toward the nearest apple even when it is not adjacent', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 10, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    state.foods = [chicken, AppleFoodEntity.newborn({ x: 14, y: 10 }, 0, 'food-1')];

    processMovingFood(state, ctx);

    expect(chicken.pos.x).toBe(11);
    expect(Math.max(Math.abs(chicken.pos.x - 14), Math.abs(chicken.pos.y - 10))).toBe(3);
  });

  test('adult actively flees a snake within five cells even when an apple is nearby', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 10, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    state.foods = [chicken, AppleFoodEntity.newborn({ x: 14, y: 10 }, 0, 'food-1')];
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 13, y: 10 }], 'left', false)];

    processMovingFood(state, ctx);

    expect(chicken.pos.x).toBe(9);
  });

  test('inside ten cells adult does not approach a snake while pursuing an apple', () => {
    const ctx = createContext();
    const state = createState(2, 30, 20);
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 10, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    state.foods = [chicken, AppleFoodEntity.newborn({ x: 20, y: 10 }, 0, 'food-1')];
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 18, y: 10 }], 'left', false)];

    processMovingFood(state, ctx);

    const snakeDistance = Math.max(
      Math.abs(chicken.pos.x - state.snakes[0].head.x),
      Math.abs(chicken.pos.y - state.snakes[0].head.y)
    );
    expect(snakeDistance).toBeGreaterThanOrEqual(8);
  });

  test('without apples adult moves toward the lowest snake density', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 10, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    state.foods = [chicken];
    state.snakes = [
      new SnakeEntity(0, 'P1', [{ x: 5, y: 9 }], 'right', false),
      new SnakeEntity(1, 'P2', [{ x: 5, y: 11 }], 'right', false),
    ];

    processMovingFood(state, ctx);

    expect(chicken.pos.x).toBe(11);
  });

  test('adult moves away from nearby chicken food within ten cells', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 10, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    const egg = ChickenFoodEntity.newborn({ x: 8, y: 10 }, 'food-1');
    state.foods = [chicken, egg];

    processMovingFood(state, ctx);

    expect(chicken.pos.x).toBe(11);
    expect(Math.max(Math.abs(chicken.pos.x - egg.pos.x), Math.abs(chicken.pos.y - egg.pos.y))).toBe(3);
  });

  test('overcrowded adult leaves the field when no edge move improves density', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 0, y: 10 },
      ctx.settings.foodAdultAge + 1,
      0,
      0,
      { x: 0, y: 10 },
      ctx.settings.chickenAdultMoveInterval - 1,
      false,
      'food-0'
    );
    state.foods = [chicken, ChickenFoodEntity.newborn({ x: 10, y: 10 }, 'food-1')];

    processMovingFood(state, ctx);

    expect(state.foods).not.toContain(chicken);
  });

  test('adult chicken lays every seventeen ticks, respects density and stops at three eggs', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 10, y: 10 },
      ctx.settings.foodAdultAge - 1,
      99,
      0,
      { x: 10, y: 10 },
      0,
      false,
      'food-0'
    );
    state.foods = [chicken, AppleFoodEntity.newborn({ x: 15, y: 15 }, 0, 'food-1')];
    state.nextFoodId = 2;

    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
    expect(chicken.clockNum).toBe(0);
    for (let tick = 1; tick < ctx.settings.chickenEggLayingInterval; tick++) {
      expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
    }
    const births = processFoodLifecycle(state, ctx);

    expect(births).toHaveLength(1);
    expect(births[0].child.kind).toBe('chicken');
    expect(births[0].child.age).toBe(0);

    chicken.clockNum = ctx.settings.chickenEggLayingInterval - 1;
    ctx.settings.maxReproductionNeighbors = 1;
    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
    expect(chicken.clockNum).toBe(0);

    chicken.reproductionCount = ctx.settings.chickenMaxEggs;
    chicken.clockNum = ctx.settings.chickenEggLayingInterval - 1;
    ctx.settings.maxReproductionNeighbors = 4;
    state.foods = [chicken];
    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
  });

  test('adult chicken does not lay above the difficulty-adjusted chicken limit', () => {
    const ctx = createContext();
    ctx.settings.maxReproductionNeighbors = 99;
    const state = createState(2, 30, 30);
    state.difficultyLevel = 2;
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 25, y: 25 }], 'left', false)];
    const chicken = new ChickenFoodEntity(
      { x: 20, y: 20 },
      ctx.settings.foodAdultAge,
      ctx.settings.chickenEggLayingInterval - 1,
      0,
      { x: 20, y: 20 }
    );
    const limit = ctx.settings.chickenReproductionLimitBase
      + state.snakes.length
      - state.difficultyLevel;
    state.foods = [
      chicken,
      ...Array.from({ length: limit }, (_, index) =>
        ChickenFoodEntity.newborn({ x: 1 + (index % 4) * 3, y: 1 + Math.floor(index / 4) * 3 })
      ),
    ];

    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
    expect(state.foods).toHaveLength(limit + 1);
    expect(chicken.clockNum).toBe(0);
  });

});
