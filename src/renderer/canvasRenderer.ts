import { GameState } from '../engine/types';
import { gameSettings } from '../engine/settings';

/**
 * Render the game state to a canvas.
 * Colors are read from gameSettings (editable via dev panel).
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize: number
): void {
  const { width, height } = state;
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  // Clear
  ctx.fillStyle = gameSettings.colorBg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines
  ctx.strokeStyle = gameSettings.colorGrid;
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

  // Draw walls
  ctx.fillStyle = gameSettings.colorWall;
  for (const wall of state.walls) {
    ctx.fillRect(wall.x * cellSize, wall.y * cellSize, cellSize, cellSize);
  }

  // Draw rabbits
  ctx.fillStyle = gameSettings.colorRabbit;
  for (const rabbit of state.rabbits) {
    ctx.fillRect(rabbit.pos.x * cellSize, rabbit.pos.y * cellSize, cellSize, cellSize);
  }

  // Draw snakes (each with its own color)
  for (let i = 0; i < state.snakes.length; i++) {
    const snake = state.snakes[i];
    if (!snake.alive) continue;

    const color = gameSettings.snakeColors[i % gameSettings.snakeColors.length];
    ctx.fillStyle = color;

    for (let j = 0; j < snake.segments.length; j++) {
      const seg = snake.segments[j];
      ctx.fillRect(seg.x * cellSize, seg.y * cellSize, cellSize, cellSize);
    }

    // Draw head outlined
    const head = snake.segments[0];
    ctx.strokeStyle = gameSettings.colorHeadStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(head.x * cellSize, head.y * cellSize, cellSize, cellSize);
  }
}

/**
 * Calculate the cell size to fit the board into available space.
 */
export function calculateCellSize(
  boardWidth: number,
  boardHeight: number,
  maxCanvasWidth: number,
  maxCanvasHeight: number
): number {
  const cellW = Math.floor(maxCanvasWidth / boardWidth);
  const cellH = Math.floor(maxCanvasHeight / boardHeight);
  return Math.max(2, Math.min(cellW, cellH));
}
