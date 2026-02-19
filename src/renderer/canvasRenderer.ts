import { GameState, Snake, Food } from '../engine/types';
import { GameSettings } from '../engine/settings';
import { getFoodPhase } from '../engine/systems/foodSystem';

/* ====== Color helpers ====== */

/** Darken a hex color by a factor (0 = unchanged, 1 = black). */
function darkenColor(hex: string, factor: number): string {
  const redChannel = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const brightnessMultiplier = 1 - factor;
  return `rgb(${Math.round(redChannel * brightnessMultiplier)},${Math.round(green * brightnessMultiplier)},${Math.round(blue * brightnessMultiplier)})`;
}

/** Desaturate + darken for dead snakes. */
function deadColor(hex: string): string {
  const redChannel = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const greyLevel = Math.round(redChannel * 0.3 + green * 0.3 + blue * 0.3);
  return `rgb(${greyLevel},${greyLevel},${greyLevel})`;
}

/* ====== Eye drawing ====== */

/**
 * Draw two small black eyes on the snake head.
 * Eye positions depend on the snake's current direction.
 */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  headX: number, headY: number,
  cellSize: number,
  direction: string
): void {
  const eyeRadius = Math.max(1, cellSize * 0.12);
  const edgePadding = cellSize * 0.25;
  ctx.fillStyle = '#000000';

  let firstEyeX: number, firstEyeY: number, secondEyeX: number, secondEyeY: number;

  switch (direction) {
    case 'up':
      firstEyeX = headX + edgePadding;          firstEyeY = headY + edgePadding;
      secondEyeX = headX + cellSize - edgePadding; secondEyeY = headY + edgePadding;
      break;
    case 'down':
      firstEyeX = headX + edgePadding;          firstEyeY = headY + cellSize - edgePadding;
      secondEyeX = headX + cellSize - edgePadding; secondEyeY = headY + cellSize - edgePadding;
      break;
    case 'left':
      firstEyeX = headX + edgePadding;          firstEyeY = headY + edgePadding;
      secondEyeX = headX + edgePadding;          secondEyeY = headY + cellSize - edgePadding;
      break;
    case 'right':
    default:
      firstEyeX = headX + cellSize - edgePadding; firstEyeY = headY + edgePadding;
      secondEyeX = headX + cellSize - edgePadding; secondEyeY = headY + cellSize - edgePadding;
      break;
  }

  ctx.beginPath();
  ctx.arc(firstEyeX, firstEyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(secondEyeX, secondEyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
}

/* ====== Main render ====== */

/**
 * Render the game state to a canvas.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize: number,
  settings: GameSettings
): void {
  const { width, height } = state;
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;

  // Clear
  ctx.fillStyle = settings.colorBg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw grid lines
  ctx.strokeStyle = settings.colorGrid;
  ctx.lineWidth = 0.5;
  for (let gridX = 0; gridX <= width; gridX++) {
    ctx.beginPath();
    ctx.moveTo(gridX * cellSize, 0);
    ctx.lineTo(gridX * cellSize, canvasHeight);
    ctx.stroke();
  }
  for (let gridY = 0; gridY <= height; gridY++) {
    ctx.beginPath();
    ctx.moveTo(0, gridY * cellSize);
    ctx.lineTo(canvasWidth, gridY * cellSize);
    ctx.stroke();
  }

  // Draw walls
  ctx.fillStyle = settings.colorWall;
  for (const wall of state.walls) {
    ctx.fillRect(wall.x * cellSize, wall.y * cellSize, cellSize, cellSize);
  }

  // Draw food
  drawFoods(ctx, state.foods, cellSize, settings);

  // Draw snakes (alive and dead)
  drawSnakes(ctx, state.snakes, cellSize, settings);
}

/* ====== Rabbits ====== */

function drawFoods(
  ctx: CanvasRenderingContext2D,
  foods: Food[],
  cellSize: number,
  settings: GameSettings
): void {
  for (const food of foods) {
    const phase = getFoodPhase(food, settings);
    const foodCenterX = food.pos.x * cellSize + cellSize / 2;
    const foodCenterY = food.pos.y * cellSize + cellSize / 2;

    if (food.kind === 'apple') {
      const icon = phase === 'young' ? '🍏' : '🍎';
      const baseIconSize = Math.max(8, Math.floor(cellSize));
      const iconScale = phase === 'young' ? 0.72 : 1;

      ctx.save();
      ctx.translate(foodCenterX, foodCenterY + 1);
      ctx.scale(iconScale, iconScale);
      ctx.font = `${baseIconSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Old apples use filter-based toning: darker and less saturated.
      if (phase === 'old') {
        ctx.filter = 'grayscale(.1) sepia(.5) saturate(0.8) brightness(0.8)';
      } else {
        ctx.filter = 'none';
      }

      ctx.fillText(icon, 0, 0);
      ctx.restore();
      continue;
    }

    let color: string;
    let radius: number;
    switch (phase) {
      case 'young':
        color = settings.colorRabbitYoung;
        radius = cellSize * 0.28; // smaller
        break;
      case 'adult':
        color = settings.colorRabbit;
        radius = cellSize * 0.42; // normal
        break;
      case 'old':
        color = settings.colorRabbitOld;
        radius = cellSize * 0.42; // same size, darker
        break;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(foodCenterX, foodCenterY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ====== Snakes ====== */

function drawSnakes(
  ctx: CanvasRenderingContext2D,
  snakes: Snake[],
  cellSize: number,
  settings: GameSettings
): void {
  for (let snakeIndex = 0; snakeIndex < snakes.length; snakeIndex++) {
    const snake = snakes[snakeIndex];
    const baseColor = settings.snakeColors[snakeIndex % settings.snakeColors.length];

    if (!snake.alive) {
      // Dead snake — greyed-out body with darker outline, no eyes
      const grey = deadColor(baseColor);
      const greyStroke = darkenColor(grey, 0.35);
      for (const segment of snake.segments) {
        const segmentX = segment.x * cellSize;
        const segmentY = segment.y * cellSize;
        ctx.fillStyle = grey;
        ctx.fillRect(segmentX, segmentY, cellSize, cellSize);
        ctx.strokeStyle = greyStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(segmentX, segmentY, cellSize, cellSize);
      }
      continue;
    }

    // Body stroke color — darker than base
    const bodyStroke = darkenColor(baseColor, 0.35);

    // Body segments (skip head)
    for (let segmentIndex = 1; segmentIndex < snake.segments.length; segmentIndex++) {
      const segment = snake.segments[segmentIndex];
      const segmentX = segment.x * cellSize;
      const segmentY = segment.y * cellSize;
      ctx.fillStyle = baseColor;
      ctx.fillRect(segmentX, segmentY, cellSize, cellSize);
      ctx.strokeStyle = bodyStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(segmentX, segmentY, cellSize, cellSize);
    }

    // Head — slightly darker than body
    const head = snake.segments[0];
    const headX = head.x * cellSize;
    const headY = head.y * cellSize;
    ctx.fillStyle = darkenColor(baseColor, 0.25);
    ctx.fillRect(headX, headY, cellSize, cellSize);

    // Head outline
    ctx.strokeStyle = settings.colorHeadStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(headX, headY, cellSize, cellSize);

    // Eyes
    drawEyes(ctx, headX, headY, cellSize, snake.direction);
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
