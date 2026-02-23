import { createEmptyBoard } from '../src/engine/board';
import { createDefaultSettings } from '../src/engine/settings';
import { GameState } from '../src/engine/types';
import { AppleFoodEntity } from '../src/engine/entities/AppleFoodEntity';
import { generateVision, rotateToWorld } from '../src/ai/vision';

function createState(width = 11, height = 11): GameState {
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

describe('ai vision', () => {
  test('normalizes "front" direction to matrix up for all snake headings', () => {
    const head = { x: 5, y: 5 };
    expect(rotateToWorld(0, -1, 'up', head)).toEqual({ x: 5, y: 4 });
    expect(rotateToWorld(0, -1, 'down', head)).toEqual({ x: 5, y: 6 });
    expect(rotateToWorld(0, -1, 'left', head)).toEqual({ x: 4, y: 5 });
    expect(rotateToWorld(0, -1, 'right', head)).toEqual({ x: 6, y: 5 });
  });

  test('produces obstacle and food signals with expected sign and distance decay', () => {
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
    state.rabbits = state.foods;

    const vision = generateVision(head, 'up', state, settings, 5);
    const frontNearObstacle = vision[1][2];
    const frontFarObstacle = vision[0][2];
    const rightNearFood = vision[2][3];
    const rightFarFood = vision[2][4];

    expect(frontNearObstacle).toBeLessThan(0);
    expect(frontFarObstacle).toBeLessThan(0);
    expect(frontNearObstacle).toBeLessThanOrEqual(frontFarObstacle);

    expect(rightNearFood).toBeGreaterThan(0);
    expect(rightFarFood).toBeGreaterThan(0);
    expect(rightNearFood).toBeGreaterThanOrEqual(rightFarFood);
  });
});

