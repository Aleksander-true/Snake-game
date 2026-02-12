import { GameState, CellContent } from '../engine/types';

const COLORS: Record<CellContent, string> = {
  ' ': '#000000',  // background
  '&': '#FF0000',  // rabbit
  '*': '#FFFFFF',  // wall
  '#': '#00FF00',  // snake
};

const GRID_COLOR = '#333333';

/**
 * Render the game state to a canvas.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize: number
): void {
  const { width, height, board } = state;
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  // Clear
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, canvasHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(canvasWidth, y * cellSize);
    ctx.stroke();
  }

  // Draw cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = board[y][x];
      if (cell !== ' ') {
        ctx.fillStyle = COLORS[cell];
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }
}
