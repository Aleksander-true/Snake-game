import { GameState, Snake, Rabbit } from '../engine/types';
import { gameSettings } from '../engine/settings';
import { getRabbitPhase } from '../engine/systems/rabbitsReproductionSystem';

/* ====== Color helpers ====== */

/** Darken a hex color by a factor (0 = unchanged, 1 = black). */
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - factor;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

/** Desaturate + darken for dead snakes. */
function deadColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const grey = Math.round(r * 0.3 + g * 0.3 + b * 0.3);
  return `rgb(${grey},${grey},${grey})`;
}

/* ====== Eye drawing ====== */

/**
 * Draw two small black eyes on the snake head.
 * Eye positions depend on the snake's current direction.
 */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number,
  cellSize: number,
  direction: string
): void {
  const eyeR = Math.max(1, cellSize * 0.12);
  const pad = cellSize * 0.25;
  ctx.fillStyle = '#000000';

  let e1x: number, e1y: number, e2x: number, e2y: number;

  switch (direction) {
    case 'up':
      e1x = hx + pad;          e1y = hy + pad;
      e2x = hx + cellSize - pad; e2y = hy + pad;
      break;
    case 'down':
      e1x = hx + pad;          e1y = hy + cellSize - pad;
      e2x = hx + cellSize - pad; e2y = hy + cellSize - pad;
      break;
    case 'left':
      e1x = hx + pad;          e1y = hy + pad;
      e2x = hx + pad;          e2y = hy + cellSize - pad;
      break;
    case 'right':
    default:
      e1x = hx + cellSize - pad; e1y = hy + pad;
      e2x = hx + cellSize - pad; e2y = hy + cellSize - pad;
      break;
  }

  ctx.beginPath();
  ctx.arc(e1x, e1y, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e2x, e2y, eyeR, 0, Math.PI * 2);
  ctx.fill();
}

/* ====== Main render ====== */

/**
 * Render the game state to a canvas.
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

  // Draw rabbits (circles with lifecycle coloring/sizing)
  drawRabbits(ctx, state.rabbits, cellSize);

  // Draw snakes (alive and dead)
  drawSnakes(ctx, state.snakes, cellSize);
}

/* ====== Rabbits ====== */

function drawRabbits(
  ctx: CanvasRenderingContext2D,
  rabbits: Rabbit[],
  cellSize: number
): void {
  for (const rabbit of rabbits) {
    const phase = getRabbitPhase(rabbit);
    const cx = rabbit.pos.x * cellSize + cellSize / 2;
    const cy = rabbit.pos.y * cellSize + cellSize / 2;

    let color: string;
    let radius: number;

    switch (phase) {
      case 'young':
        color = gameSettings.colorRabbitYoung;
        radius = cellSize * 0.28; // smaller
        break;
      case 'adult':
        color = gameSettings.colorRabbit;
        radius = cellSize * 0.42; // normal
        break;
      case 'old':
        color = gameSettings.colorRabbitOld;
        radius = cellSize * 0.42; // same size, darker
        break;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ====== Snakes ====== */

function drawSnakes(
  ctx: CanvasRenderingContext2D,
  snakes: Snake[],
  cellSize: number
): void {
  for (let i = 0; i < snakes.length; i++) {
    const snake = snakes[i];
    const baseColor = gameSettings.snakeColors[i % gameSettings.snakeColors.length];

    if (!snake.alive) {
      // Dead snake — greyed-out body with darker outline, no eyes
      const grey = deadColor(baseColor);
      const greyStroke = darkenColor(grey, 0.35);
      for (const seg of snake.segments) {
        const sx = seg.x * cellSize;
        const sy = seg.y * cellSize;
        ctx.fillStyle = grey;
        ctx.fillRect(sx, sy, cellSize, cellSize);
        ctx.strokeStyle = greyStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, cellSize, cellSize);
      }
      continue;
    }

    // Body stroke color — darker than base
    const bodyStroke = darkenColor(baseColor, 0.35);

    // Body segments (skip head)
    for (let j = 1; j < snake.segments.length; j++) {
      const seg = snake.segments[j];
      const sx = seg.x * cellSize;
      const sy = seg.y * cellSize;
      ctx.fillStyle = baseColor;
      ctx.fillRect(sx, sy, cellSize, cellSize);
      ctx.strokeStyle = bodyStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, cellSize, cellSize);
    }

    // Head — slightly darker than body
    const head = snake.segments[0];
    const hx = head.x * cellSize;
    const hy = head.y * cellSize;
    ctx.fillStyle = darkenColor(baseColor, 0.25);
    ctx.fillRect(hx, hy, cellSize, cellSize);

    // Head outline
    ctx.strokeStyle = gameSettings.colorHeadStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(hx, hy, cellSize, cellSize);

    // Eyes
    drawEyes(ctx, hx, hy, cellSize, snake.direction);
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
