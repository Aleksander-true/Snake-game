import {
  ChickenFoodEntity,
  createDefaultSettings,
  createEmptyBoard,
  createMeatDropsForSnakeDeaths,
  GameEngine,
  MeatFoodEntity,
  processFoodLifecycle,
  SnakeEntity,
} from '@snake-game/core';
import type { DomainEvent, EngineContext, GameState } from '@snake-game/core';

function createContext(): EngineContext {
  return {
    settings: createDefaultSettings(),
    rng: { next: () => 0.99, nextInt: () => 0 },
  };
}

function createState(level = 1, width = 12, height = 12): GameState {
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

describe('Meat food', () => {
  test('expired chicken becomes fresh meat and old meat is removed', () => {
    const ctx = createContext();
    const state = createState();
    const chicken = new ChickenFoodEntity(
      { x: 5, y: 5 },
      ctx.settings.foodMaxAge - 1,
      10,
      0,
      { x: 5, y: 5 },
      0,
      false,
      'food-0'
    );
    state.foods = [chicken, new MeatFoodEntity({ x: 8, y: 8 }, ctx.settings.meatMaxAge - 1, 'food-1')];
    state.nextFoodId = 2;

    processFoodLifecycle(state, ctx);

    expect(state.foods).toHaveLength(1);
    expect(state.foods[0]).toMatchObject({ kind: 'meat', age: 0, pos: { x: 5, y: 5 } });
  });

  test('eligible snake death creates one meat per three body segments', () => {
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'P1',
      [
        { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
        { x: 6, y: 2 }, { x: 7, y: 2 }, { x: 8, y: 2 },
      ],
      'left',
      false
    );
    snake.die('Съела саму себя');
    state.snakes = [snake];
    const events: DomainEvent[] = [
      { type: 'SNAKE_DIED', snakeId: snake.id, reason: 'Съела саму себя' },
    ];

    const drops = createMeatDropsForSnakeDeaths(state, events);

    expect(drops).toHaveLength(3);
    expect(new Set(drops.map(food => `${food.pos.x},${food.pos.y}`)).size).toBe(3);
  });

  test('starvation never creates meat', () => {
    const state = createState();
    const snake = new SnakeEntity(0, 'P1', [{ x: 2, y: 2 }], 'right', false);
    snake.die('Умерла с голоду');
    state.snakes = [snake];

    const drops = createMeatDropsForSnakeDeaths(state, [
      { type: 'SNAKE_DIED', snakeId: snake.id, reason: 'Умерла с голоду' },
    ]);

    expect(drops).toHaveLength(0);
    expect(state.foods).toHaveLength(0);
  });

  test('tick pipeline drops meat once after a wall collision', () => {
    const ctx = createContext();
    const engine = new GameEngine(ctx);
    const state = createState();
    state.walls = [{ x: 0, y: 1 }];
    state.snakes = [
      new SnakeEntity(
        0,
        'P1',
        [
          { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
          { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 },
        ],
        'left',
        false
      ),
      new SnakeEntity(1, 'P2', [{ x: 9, y: 9 }, { x: 10, y: 9 }], 'left', false),
      new SnakeEntity(2, 'P3', [{ x: 2, y: 9 }, { x: 1, y: 9 }], 'right', false),
    ];

    engine.processTick(state);
    expect(state.foods.filter(food => food.kind === 'meat')).toHaveLength(3);

    engine.processTick(state);
    expect(state.foods.filter(food => food.kind === 'meat')).toHaveLength(3);
  });
});
