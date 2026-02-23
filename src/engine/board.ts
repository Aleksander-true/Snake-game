import { GameSettings } from './settings';
import { CellContent, Food, GameState, Position } from './types';

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
        board[seg.y][seg.x] = String(snake.id + 1);
      }
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
  if (food.kind !== 'apple') return 1;
  if (food.age >= settings.foodAdultAge && food.age < settings.foodMaxAge) return 1;
  if (food.age >= settings.foodYoungAge && food.age < settings.foodAdultAge) return 2;
  return 1;
}
