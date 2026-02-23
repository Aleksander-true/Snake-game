import { createEmptyBoard } from '../src/engine/board';
import { SnakeEntity } from '../src/engine/entities/SnakeEntity';
import { AppleFoodEntity } from '../src/engine/entities/AppleFoodEntity';
import { createDefaultSettings, resetSettings } from '../src/engine/settings';
import { GameState } from '../src/engine/types';
import { chooseGreedyBoardDirection } from '../src/heuristic';

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

    const direction = chooseGreedyBoardDirection(state, snake, createDefaultSettings());
    expect(direction).toBe('right');
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
    state.rabbits = state.foods;

    const direction = chooseGreedyBoardDirection(state, snake, settings);
    expect(direction).toBe('right');
  });
});

