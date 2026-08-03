import {
  buildBoard,
  createDefaultSettings,
  createEmptyBoard,
  gameSettings,
  GameEngine,
  getCumulativeTargetScore,
  getHeuristicAlgorithmById,
  getInitialFoodCount,
  getTargetScore,
  inBounds,
  isReverseDirection,
  resetSettings,
} from '@snake-game/core';
import type { EngineContext, RandomPort } from '@snake-game/core';
import { GameFSM } from '../src/app/gameFSM';

/** Deterministic RNG for tests — always returns 0.5 / floor(0.5 * max). */
const testRng: RandomPort = {
  next: () => 0.5,
  nextInt: (max: number) => Math.floor(0.5 * max),
};

/** Default test context with standard settings and deterministic RNG. */
const testCtx: EngineContext = {
  settings: createDefaultSettings(),
  rng: testRng,
};

const testEngine = new GameEngine(testCtx);

describe('Smoke tests — project skeleton', () => {
  test('createEmptyBoard creates correct dimensions', () => {
    const board = createEmptyBoard(10, 8);
    expect(board.length).toBe(8);
    expect(board[0].length).toBe(10);
    expect(board[0][0]).toBe(' ');
  });

  test('inBounds checks correctly', () => {
    expect(inBounds({ x: 0, y: 0 }, 10, 10)).toBe(true);
    expect(inBounds({ x: 9, y: 9 }, 10, 10)).toBe(true);
    expect(inBounds({ x: -1, y: 0 }, 10, 10)).toBe(false);
    expect(inBounds({ x: 10, y: 0 }, 10, 10)).toBe(false);
  });

  test('isReverseDirection detects opposite directions', () => {
    expect(isReverseDirection('up', 'down')).toBe(true);
    expect(isReverseDirection('left', 'right')).toBe(true);
    expect(isReverseDirection('up', 'left')).toBe(false);
    expect(isReverseDirection('up', 'up')).toBe(false);
  });

  test('createSnake creates snake with correct length', () => {
    const snake = testEngine.createSnake(1, 'Test', { x: 20, y: 20 }, 'right', false);
    expect(snake.segments.length).toBe(testCtx.settings.initialSnakeLength);
    expect(snake.segments[0]).toEqual({ x: 20, y: 20 });
    expect(snake.alive).toBe(true);
    expect(snake.score).toBe(0);
  });

  test('getTargetScore computes correctly', () => {
    const settings = testCtx.settings;
    expect(getTargetScore(1, settings)).toBe(Math.floor(settings.targetScoreCoeff * 1 + settings.targetScoreBase));
    expect(getTargetScore(5, settings)).toBe(Math.floor(settings.targetScoreCoeff * 5 + settings.targetScoreBase));
  });

  test('getCumulativeTargetScore sums level targets', () => {
    const settings = testCtx.settings;
    const level1Target = getTargetScore(1, settings);
    const level2Target = getTargetScore(2, settings);
    const level3Target = getTargetScore(3, settings);
    expect(getCumulativeTargetScore(1, settings)).toBe(level1Target);
    expect(getCumulativeTargetScore(2, settings)).toBe(level1Target + level2Target);
    expect(getCumulativeTargetScore(3, settings)).toBe(level1Target + level2Target + level3Target);
  });

  test('getInitialFoodCount computes correctly', () => {
    const settings = testCtx.settings;
    const expected1 = Math.floor(settings.foodCountPerSnakeCoeff * 1 + (settings.foodCountBase - 5));
    const expected2 = Math.floor(settings.foodCountPerSnakeCoeff * 2 + (settings.foodCountBase - 3));
    expect(getInitialFoodCount(1, 5, settings)).toBe(expected1);
    expect(getInitialFoodCount(2, 3, settings)).toBe(expected2);
  });

  test('resetSettings restores singleton runtime settings', () => {
    const original = createDefaultSettings().hungerThreshold;
    gameSettings.hungerThreshold = original + 99;
    resetSettings();
    expect(gameSettings.hungerThreshold).toBe(original);
  });

  test('canonical defaults are loaded from gameDefaults.json', () => {
    const settings = createDefaultSettings();
    expect(settings.foodCountBase).toBe(5);
    expect(settings.reproductionProbabilityBase).toBe(0.01);
    expect(settings.chickenSpawnProbability).toBe(0.3);
    expect(settings.chickenCrowdedSpawnProbability).toBe(0.6);
    expect(settings.foodPeriodicSpawnInterval).toBe(100);
    expect(settings.chickenChickRoamRadius).toBe(5);
    expect(settings.chickenAdultSafetyRadius).toBe(10);
    expect(settings.chickenOvercrowdingRadius).toBe(10);
    expect(settings.chickenEggLayingInterval).toBe(17);
    expect(settings.chickenAppleAgeReduction).toBe(10);
    expect(settings.chickenAppleReproductionReduction).toBe(1);
    expect(settings.chickenMaxEggs).toBe(3);
    expect(settings.meatMaxAge).toBe(50);
    expect(settings.levelSizeIncrement).toBe(2);
    expect(settings.survivalMaxBoardLevel).toBe(10);
  });

  test('GameFSM handles basic transitions and invalid transition safely', () => {
    const fsm = new GameFSM();
    expect(fsm.send('START_GAME')).toBe('Playing');
    expect(fsm.handleSpace()).toBe('PAUSE');
    expect(fsm.send('PAUSE')).toBe('Paused');
    expect(fsm.send('GO_TO_MENU')).toBeNull();
  });

  test('board uses value markers for food and snake id markers', () => {
    const state = testEngine.createGameState(
      { playerCount: 1, botCount: 0, playerNames: ['Smoke'], difficultyLevel: 1 },
      1
    );
    testEngine.initLevel(state, { playerCount: 1, botCount: 0, playerNames: ['Smoke'], difficultyLevel: 1 });

    state.foods = [
      {
        id: 'food-test',
        pos: { x: 2, y: 2 },
        kind: 'apple',
        age: testCtx.settings.foodYoungAge,
        clockNum: 0,
        reproductionCount: 0,
        tickLifecycle(): void {},
        resetReproductionClock(): void {},
        incrementReproductionCount(): void {},
      },
    ];
    state.board = buildBoard(state, testCtx.settings);

    const snakeHead = state.snakes[0].segments[0];
    expect(state.board[snakeHead.y][snakeHead.x]).toBe('1');

    expect(state.board[2][2]).toMatch(/^&x\d+$/);
  });

  test('heuristic registry resolves tier algorithms', () => {
    expect(getHeuristicAlgorithmById('wise').id).toBe('wise');
    expect(getHeuristicAlgorithmById('solid').id).toBe('solid');
    expect(getHeuristicAlgorithmById('basic').id).toBe('basic');
    expect(getHeuristicAlgorithmById('rookie').id).toBe('rookie');
  });
});
