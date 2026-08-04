import {
  AppleFoodEntity,
  chebyshevDistance,
  countNearbyFood,
  createDefaultSettings,
  createEmptyBoard,
  getFoodPhase,
  isValidFoodPosition,
  processFoodLifecycle,
  RabbitFoodEntity,
  resetSettings,
  SnakeEntity,
} from '@snake-game/core';
import type { EngineContext, GameState, RandomPort } from '@snake-game/core';

function createState(width = 20, height = 20): GameState {
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

describe('Food lifecycle and reproduction', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('distance, phase and nearby counting helpers work as expected', () => {
    const settings = createDefaultSettings();
    const food = new RabbitFoodEntity({ x: 5, y: 5 }, 0, 0, 0);

    expect(chebyshevDistance({ x: 1, y: 1 }, { x: 4, y: 3 })).toBe(3);
    expect(getFoodPhase(food, settings)).toBe('young');

    food.age = settings.foodYoungAge;
    expect(getFoodPhase(food, settings)).toBe('adult');

    food.age = settings.foodAdultAge;
    expect(getFoodPhase(food, settings)).toBe('old');

    const foods = [
      food,
      new RabbitFoodEntity({ x: 6, y: 6 }, 10, 0, 0),
      new RabbitFoodEntity({ x: 12, y: 12 }, 10, 0, 0),
    ];
    expect(countNearbyFood({ x: 5, y: 5 }, foods, 2, food)).toBe(1);
  });

  test('isValidFoodPosition rejects walls, alive snakes and nearby food', () => {
    const state = createState(10, 10);
    state.walls = [{ x: 2, y: 2 }];
    state.snakes = [new SnakeEntity(0, 'P1', [{ x: 3, y: 3 }, { x: 3, y: 4 }], 'up', false)];
    state.foods = [new RabbitFoodEntity({ x: 5, y: 5 }, 0, 0, 0)];

    expect(isValidFoodPosition({ x: -1, y: 0 }, state)).toBe(false);
    expect(isValidFoodPosition({ x: 2, y: 2 }, state)).toBe(false);
    expect(isValidFoodPosition({ x: 3, y: 4 }, state)).toBe(false);
    expect(isValidFoodPosition({ x: 6, y: 6 }, state)).toBe(false);
    expect(isValidFoodPosition({ x: 8, y: 8 }, state)).toBe(true);
  });

  test('processFoodLifecycle increments lifecycle, spawns child and resets parent counters', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductions = 5;
    settings.maxReproductionNeighbors = 99;
    settings.foodMaxAge = 200;

    const rng: RandomPort = {
      next: () => 0,
      nextInt: () => 0,
    };
    const ctx: EngineContext = { settings, rng };
    const state = createState(30, 30);
    const parent = new RabbitFoodEntity({ x: 15, y: 15 }, settings.foodYoungAge, 1, 0);
    state.foods = [parent];

    const births = processFoodLifecycle(state, ctx);

    expect(parent.age).toBe(settings.foodYoungAge + 1);
    expect(parent.clockNum).toBe(0);
    expect(parent.reproductionCount).toBe(1);
    expect(births.length).toBe(1);
    expect(state.foods.length).toBe(2);
    expect(births[0].child.age).toBe(0);
    expect(births[0].child.clockNum).toBe(0);
    expect(births[0].child.reproductionCount).toBe(0);
    const d = chebyshevDistance(parent.pos, births[0].child.pos);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(2);
  });

  test('processFoodLifecycle blocks spawn when neighbor limit is reached and removes old food', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductionNeighbors = 1;
    settings.neighborReproductionRadius = 4;
    settings.foodMaxAge = 150;

    const ctx: EngineContext = {
      settings,
      rng: {
        next: () => 0,
        nextInt: () => 0,
      },
    };
    const state = createState(20, 20);
    const adult = new RabbitFoodEntity({ x: 10, y: 10 }, settings.foodYoungAge, 2, 0);
    const neighbor = new RabbitFoodEntity({ x: 11, y: 10 }, settings.foodYoungAge, 2, 0);
    const old = new RabbitFoodEntity({ x: 2, y: 2 }, settings.foodMaxAge - 1, 0, 0);
    state.foods = [adult, neighbor, old];

    const births = processFoodLifecycle(state, ctx);
    expect(births.length).toBe(0);
    expect(state.foods.some(r => r.pos.x === 2 && r.pos.y === 2)).toBe(false);
    expect(state.foods.length).toBe(2);
  });

  test('processFoodLifecycle does not spawn when maxReproductions is reached', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductions = 1;
    settings.maxReproductionNeighbors = 99;

    const ctx: EngineContext = {
      settings,
      rng: {
        next: () => 0,
        nextInt: () => 0,
      },
    };
    const state = createState(20, 20);
    const adultAtLimit = new RabbitFoodEntity(
      { x: 10, y: 10 },
      settings.foodYoungAge,
      settings.reproductionMinCooldown,
      settings.maxReproductions
    );
    state.foods = [adultAtLimit];

    const births = processFoodLifecycle(state, ctx);
    expect(births).toHaveLength(0);
    expect(state.foods).toHaveLength(1);
    expect(state.foods[0].reproductionCount).toBe(settings.maxReproductions);
  });

  test('food reproduction stops at the shared difficulty-adjusted population limit', () => {
    const settings = createDefaultSettings();
    settings.reproductionProbabilityBase = 1;
    settings.reproductionMinCooldown = 1;
    settings.maxReproductionNeighbors = 99;
    const ctx: EngineContext = {
      settings,
      rng: { next: () => 0, nextInt: () => 0 },
    };
    const state = createState(30, 30);
    state.difficultyLevel = 3;
    state.snakes = [
      new SnakeEntity(0, 'P1', [{ x: 25, y: 25 }], 'left', false),
      new SnakeEntity(1, 'P2', [{ x: 27, y: 27 }], 'left', false),
    ];
    const parent = new AppleFoodEntity(
      { x: 20, y: 20 },
      settings.foodYoungAge,
      settings.reproductionMinCooldown,
      0
    );
    const limit = settings.foodReproductionLimitBase
      + state.snakes.length
      - state.difficultyLevel;
    state.foods = [
      parent,
      ...Array.from({ length: limit - 2 }, (_, index) =>
        AppleFoodEntity.newborn({ x: 1 + (index % 4) * 3, y: 1 + Math.floor(index / 4) * 3 })
      ),
    ];

    expect(processFoodLifecycle(state, ctx)).toHaveLength(1);
    expect(state.foods).toHaveLength(limit);

    parent.clockNum = settings.reproductionMinCooldown;
    expect(processFoodLifecycle(state, ctx)).toHaveLength(0);
    expect(state.foods).toHaveLength(limit);
  });
});
