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
 * Builds the board[][] from current entities (walls, rabbits, snakes).
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

  // Place rabbits
  for (const rabbit of state.rabbits) {
    if (inBounds(rabbit.pos, state.width, state.height)) {
      board[rabbit.pos.y][rabbit.pos.x] = '&';
    }
  }

  // Place snakes
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
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
