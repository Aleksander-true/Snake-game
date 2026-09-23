import { AppleFoodEntity, createDefaultSettings, createEmptyBoard, generateVision, rotateToWorld } from '@snake-game/core';
import type { GameState } from '@snake-game/core';

function createState(width = 11, height = 11): GameState {
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

describe('ai vision', () => {
  test('normalizes "front" direction to matrix up for all snake headings', () => {
    const head = { x: 5, y: 5 };
    expect(rotateToWorld(0, -1, 'up', head)).toEqual({ x: 5, y: 4 });
    expect(rotateToWorld(0, -1, 'down', head)).toEqual({ x: 5, y: 6 });
    expect(rotateToWorld(0, -1, 'left', head)).toEqual({ x: 4, y: 5 });
    expect(rotateToWorld(0, -1, 'right', head)).toEqual({ x: 6, y: 5 });
  });

  test('keeps visible food equal to its value while legacy obstacles decay', () => {
    const settings = createDefaultSettings();
    const state = createState();
    const head = { x: 5, y: 5 };

    // Obstacles in front at different distances.
    state.walls = [{ x: 5, y: 4 }, { x: 5, y: 3 }];
    // Foods on the right at different distances.
    state.foods = [
      AppleFoodEntity.newborn({ x: 6, y: 5 }, 0),
      AppleFoodEntity.newborn({ x: 7, y: 5 }, 0),
    ];

    const vision = generateVision(head, 'up', state, settings, 5);
    const frontNearObstacle = vision[1][2];
    const frontFarObstacle = vision[0][2];
    const rightNearFood = vision[2][3];
    const rightFarFood = vision[2][4];

    expect(frontNearObstacle).toBeLessThan(0);
    expect(frontFarObstacle).toBeLessThan(0);
    expect(frontNearObstacle).toBeLessThanOrEqual(frontFarObstacle);

    expect(rightNearFood).toBe(100);
    expect(rightFarFood).toBe(100);
  });

  test.each(['up', 'right', 'down', 'left'] as const)(
    'projects food with nonlinear distance decay facing %s', direction => {
      const settings = createDefaultSettings();
      const head = { x: 30, y: 30 };
      const state = createState(61, 61);
      for (const distance of [1, 2, 4, 20]) {
        state.foods = [AppleFoodEntity.newborn(rotateToWorld(0, -2 - distance, direction, head), 0)];
        const value = generateVision(head, direction, state, settings, 5)[0][2] / 100;
        expect(value).toBeCloseTo(0.05 + 0.95 / (1 + distance), 12);
        expect(value).toBeGreaterThan(0.05);
        expect(value).toBeLessThan(1);
      }
    },
  );

  test('saturates a group below its maximum value and applies the floor only once', () => {
    const settings = createDefaultSettings();
    const state = createState();
    const head = { x: 5, y: 5 };
    const signal = () => generateVision(head, 'up', state, settings, 5)[2][4] / 100;
    state.foods = [AppleFoodEntity.newborn({ x: 8, y: 5 }, 0)];
    const single = signal();
    state.foods.push(AppleFoodEntity.newborn({ x: 9, y: 5 }, 0));
    expect(signal()).toBeGreaterThan(single);
    expect(signal()).toBeCloseTo(0.05 + 0.95 * 1.5 / 2.5);
    state.foods = Array.from({ length: 10000 }, (_, index) =>
      AppleFoodEntity.newborn({ x: 8 + index, y: 5 }, 0));
    expect(signal()).toBeLessThan(1);
    // No board-sized allocation is needed to test the distance limit.
    state.foods.forEach(food => { food.pos.x += 1e12; });
    expect(signal()).toBeCloseTo(0.05, 6);
  });

  test('uses the maximum projected value as ceiling and preserves direct edge food', () => {
    const settings = createDefaultSettings();
    settings.foodSignalClose = 500;
    settings.foodSignalDecay = 0;
    settings.foodSignalMin = 300;
    const state = createState();
    const head = { x: 5, y: 5 };
    const mature = AppleFoodEntity.newborn({ x: 8, y: 5 }, 0);
    mature.age = settings.foodYoungAge;
    state.foods = [mature, AppleFoodEntity.newborn({ x: 9, y: 5 }, 0)];
    const signal = () => generateVision(head, 'up', state, settings, 5)[2][4] / 100;
    expect(signal()).toBeCloseTo(0.05 + 1.95 * 2.5 / 4.5);
    const forward = signal();
    state.foods.reverse();
    expect(signal()).toBeCloseTo(forward, 12);
    state.foods.push(AppleFoodEntity.newborn({ x: 7, y: 5 }, 0));
    expect(signal()).toBe(1);
    state.foods[state.foods.length - 1].age = settings.foodYoungAge;
    expect(signal()).toBe(2);
    state.walls = [{ x: 7, y: 5 }];
    expect(signal()).toBeLessThan(0);
  });

  test('measures distance from each edge of a legacy even window', () => {
    const settings = createDefaultSettings();
    const state = createState();
    state.foods = [
      AppleFoodEntity.newborn({ x: 7, y: 5 }, 0),
      AppleFoodEntity.newborn({ x: 2, y: 5 }, 0),
    ];
    const vision = generateVision({ x: 5, y: 5 }, 'up', state, settings, 4);
    expect(vision[2][0] / 100).toBeCloseTo(0.525);
    expect(vision[2][3] / 100).toBeCloseTo(0.525);
    expect(vision[0][0]).toBe(0);
  });
});
