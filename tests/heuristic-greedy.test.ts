import {
  AppleFoodEntity,
  chooseDirectionByDifficulty,
  chooseWiseDirection,
  createDefaultSettings,
  createEmptyBoard,
  HedgehogEntity,
  rankDirectionsForDebug,
  resetSettings,
  SnakeEntity,
} from '@snake-game/core';
import type { GameState } from '@snake-game/core';

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

describe('greedy board heuristic', () => {
  beforeEach(() => {
    resetSettings();
  });

  test('avoids immediate death when selecting next move', () => {
    const state = createState(8, 8);
    const snake = new SnakeEntity(
      0,
      'Bot',
      [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }],
      'up',
      true
    );
    state.snakes = [snake];

    const direction = chooseWiseDirection(state, snake, createDefaultSettings());
    expect(direction).toBe('right');
  });

  test('moves away from a nearby hedgehog footprint', () => {
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'Bot',
      [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }],
      'up',
      true
    );
    state.snakes = [snake];
    state.enemies = [new HedgehogEntity('enemy-0', { x: 7, y: 4 }, 2, 2, 'left')];

    const direction = chooseWiseDirection(state, snake, createDefaultSettings());

    expect(direction).toBe('left');
  });

  test('prefers higher-value food when paths are equally safe', () => {
    const settings = createDefaultSettings();
    const state = createState(12, 12);
    const snake = new SnakeEntity(
      0,
      'Bot',
      [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }],
      'up',
      true
    );
    state.snakes = [snake];
    state.foods = [
      AppleFoodEntity.newborn({ x: 5, y: 4 }, 0),
      AppleFoodEntity.newborn({ x: 6, y: 5 }, settings.foodYoungAge),
    ];

    const direction = chooseWiseDirection(state, snake, settings);
    expect(direction).toBe('right');
  });

  test('difficulty-based selection returns a valid movement direction for all tiers', () => {
    const settings = createDefaultSettings();
    const state = createState(12, 12);
    const snake = new SnakeEntity(
      0,
      'Bot',
      [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }],
      'right',
      true
    );
    state.snakes = [snake];

    const tiers = [1, 5, 8, 10];
    for (const difficulty of tiers) {
      state.difficultyLevel = difficulty;
      state.tickCount = difficulty * 10;
      const direction = chooseDirectionByDifficulty(state, snake, settings);
      expect(['up', 'right', 'down']).toContain(direction);
    }
  });

  test('prefers front, then left, then right when candidate scores are tied', () => {
    const state = createState();
    const snake = new SnakeEntity(
      0,
      'Bot',
      [{ x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }],
      'up',
      true
    );
    state.snakes = [snake];
    const ranked = rankDirectionsForDebug(state, snake, createDefaultSettings(), {
      id: 'ties',
      trapPenalty: 0,
      areaWeight: 0,
      escapeWeight: 0,
      foodWeight: 0,
      immediateEatWeight: 0,
      fearWeight: 0,
      longSnakeThreshold: 999,
      longSnakeFoodPenalty: 0,
      mistakePeriod: 0,
      badMoveBias: 0,
    });

    expect(ranked.map(candidate => candidate.direction)).toEqual(['up', 'left', 'right']);
  });

  test('avoids a cell that another snake can enter head-on', () => {
    const settings = createDefaultSettings();
    const state = createState();
    const bot = new SnakeEntity(0, 'Bot', [{ x: 4, y: 6 }, { x: 3, y: 6 }], 'right', true);
    const opponent = new SnakeEntity(1, 'Opponent', [{ x: 6, y: 6 }, { x: 7, y: 6 }], 'left', true);
    state.snakes = [bot, opponent];

    const direction = chooseWiseDirection(state, bot, settings);

    expect(direction).not.toBe('right');
  });
});
