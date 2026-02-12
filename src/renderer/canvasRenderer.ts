import { GameState, CellContent, Snake } from '../engine/types';

const GRID_COLOR = '#1a1a1a';
const BG_COLOR = '#000000';
const WALL_COLOR = '#FFFFFF';
const RABBIT_COLOR = '#FF0000';

/** Distinct snake colors for up to 6 snakes */
const SNAKE_COLORS = [
  '#00FF00', // green
  '#00CCFF', // cyan
  '#FFFF00', // yellow
  '#FF00FF', // magenta
  '#FF8800', // orange
  '#88FF88', // light green
];

/**
 * Render the game state to a canvas.
 * Draws per-entity (not per-cell) for snake color variety.
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
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines
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

  // Draw walls
  ctx.fillStyle = WALL_COLOR;
  for (const wall of state.walls) {
    ctx.fillRect(wall.x * cellSize, wall.y * cellSize, cellSize, cellSize);
  }

  // Draw rabbits
  ctx.fillStyle = RABBIT_COLOR;
  for (const rabbit of state.rabbits) {
    ctx.fillRect(rabbit.pos.x * cellSize, rabbit.pos.y * cellSize, cellSize, cellSize);
  }

  // Draw snakes (each with its own color)
  for (let i = 0; i < state.snakes.length; i++) {
    const snake = state.snakes[i];
    if (!snake.alive) continue;

    const color = SNAKE_COLORS[i % SNAKE_COLORS.length];
    ctx.fillStyle = color;

    for (let j = 0; j < snake.segments.length; j++) {
      const seg = snake.segments[j];
      ctx.fillRect(seg.x * cellSize, seg.y * cellSize, cellSize, cellSize);
    }

    // Draw head slightly different (brighter / outlined)
    const head = snake.segments[0];
    ctx.strokeStyle = '#FFFFFF';
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
