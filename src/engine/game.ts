import { GameState, GameConfig, Direction, Snake, Rabbit } from './types';
import { buildBoard, createEmptyBoard } from './board';
import {
  BASE_WIDTH, BASE_HEIGHT, LEVEL_SIZE_INCREMENT,
  INITIAL_SNAKE_LENGTH, LEVEL_TIME_LIMIT,
} from './constants';

/**
 * Create initial game state for a given config and level.
 */
export function createGameState(config: GameConfig, level: number): GameState {
  const width = BASE_WIDTH + (level - 1) * LEVEL_SIZE_INCREMENT;
  const height = BASE_HEIGHT + (level - 1) * LEVEL_SIZE_INCREMENT;

  const state: GameState = {
    board: createEmptyBoard(width, height),
    width,
    height,
    snakes: [],
    rabbits: [],
    walls: [],
    level,
    difficultyLevel: config.difficultyLevel,
    tickCount: 0,
    levelTimeLeft: LEVEL_TIME_LIMIT,
    gameOver: false,
    levelComplete: false,
  };

  return state;
}

/**
 * Create a snake entity with a starting position.
 */
export function createSnake(
  id: number,
  name: string,
  startPos: { x: number; y: number },
  direction: Direction,
  isBot: boolean
): Snake {
  const segments = [];
  for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
    switch (direction) {
      case 'up':
        segments.push({ x: startPos.x, y: startPos.y + i });
        break;
      case 'down':
        segments.push({ x: startPos.x, y: startPos.y - i });
        break;
      case 'left':
        segments.push({ x: startPos.x + i, y: startPos.y });
        break;
      case 'right':
        segments.push({ x: startPos.x - i, y: startPos.y });
        break;
    }
  }

  return {
    id,
    name,
    segments,
    direction,
    alive: true,
    score: 0,
    levelsWon: 0,
    ticksWithoutFood: 0,
    isBot,
  };
}

/**
 * Get the target score for a level (single-player mode).
 */
export function getTargetScore(level: number): number {
  return Math.floor(level * 1.2 + 10);
}

/**
 * Get the number of wall clusters for a level.
 */
export function getWallClusterCount(level: number): number {
  return Math.floor(level * 1.2 + 2);
}

/**
 * Get wall segment length for difficulty.
 */
export function getWallLength(difficultyLevel: number): number {
  return Math.floor(difficultyLevel * 1.2 + 3);
}

/**
 * Get initial rabbit count.
 */
export function getInitialRabbitCount(snakeCount: number, difficultyLevel: number): number {
  return Math.floor(snakeCount * 1.5 + (10 - difficultyLevel));
}
