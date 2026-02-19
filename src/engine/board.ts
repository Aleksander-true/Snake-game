import { CellContent, GameState, Position } from './types';

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
export function buildBoard(state: GameState): CellContent[][] {
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
      board[food.pos.y][food.pos.x] = '&';
    }
  }

  // Place snakes
  for (const snake of state.snakes) {
    for (const seg of snake.segments) {
      if (inBounds(seg, state.width, state.height)) {
        board[seg.y][seg.x] = '#';
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
