import { GameSettings } from './settings';
import { CellContent, Food, GameState, Position } from './types';
import { getFoodReward } from './systems/foodSystem';
import { getEnemyCells } from './systems/enemySystem';

/**
 * Creates an empty board of given dimensions.
 */
export function createEmptyBoard(width: number, height: number): CellContent[][] {
  const board: CellContent[][] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    board.push(new Array<CellContent>(width).fill(' '));
  }
  return board;
}

/**
 * Builds the board[][] from current entities (walls, food, snakes).
 * This is called each tick after all logic updates.
 */
export function buildBoard(state: GameState, settings: GameSettings): CellContent[][] {
  const board = createEmptyBoard(state.width, state.height);

  // Place walls
  for (const wall of state.walls) {
    if (inBounds(wall, state.width, state.height)) {
      board[wall.y][wall.x] = '*';
    }
  }

  // Place food
  for (const food of state.foods) {
    if (inBounds(food.pos, state.width, state.height)) {
      const reward = getFoodScoreValue(food, settings);
      board[food.pos.y][food.pos.x] = `&x${reward}`;
    }
  }

  // Place snakes
  for (const snake of state.snakes) {
    for (const seg of snake.segments) {
      if (inBounds(seg, state.width, state.height)) {
        if (!snake.alive && board[seg.y][seg.x].startsWith('&x')) continue;
        board[seg.y][seg.x] = String(snake.id + 1);
      }
    }
  }

  // Enemies have display and collision priority over food and snake bodies.
  for (const enemy of state.enemies) {
    for (const cell of getEnemyCells(enemy)) {
      if (inBounds(cell, state.width, state.height)) board[cell.y][cell.x] = '!';
    }
  }

  return board;
}

/**
 * Check if a position is within board bounds.
 */
export function inBounds(pos: Position, width: number, height: number): boolean {
  return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

function getFoodScoreValue(food: Food, settings: GameSettings): number {
  return getFoodReward(food, settings).points;
}
