import { getFoodPhase } from '@snake-game/core';
import type { Food, GameSettings, GameState, Snake } from '@snake-game/core';
import { darkenColor, getDeadSnakeColor } from '../shared/color';

const PLAYER_MARKER_DURATION_MS = 1000;
const PLAYER_MARKER_PULSE_MS = 300;

export interface CanvasRenderOptions {
  playerMarkerElapsedMs?: number;
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
  settings: GameSettings,
  options: CanvasRenderOptions = {}
): void {
  const { width, height } = state;
  const canvasWidth = width * cellSize;
  const canvasHeight = height * cellSize;
  const survivalMaxWidth = settings.baseWidth
    + (settings.survivalMaxBoardLevel - 1) * settings.levelSizeIncrement;
  const survivalMaxHeight = settings.baseHeight
    + (settings.survivalMaxBoardLevel - 1) * settings.levelSizeIncrement;
  const viewportWidth = state.gameMode === 'survival' ? survivalMaxWidth * cellSize : canvasWidth;
  const viewportHeight = state.gameMode === 'survival' ? survivalMaxHeight * cellSize : canvasHeight;
  const offsetX = (viewportWidth - canvasWidth) / 2;
  const offsetY = (viewportHeight - canvasHeight) / 2;

  // Clear
  ctx.fillStyle = settings.colorBg;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  ctx.save();
  ctx.translate(offsetX, offsetY);

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

  drawFoods(ctx, state.foods.filter(food => food.kind !== 'meat'), cellSize, settings);
  drawSnakes(ctx, state.snakes, cellSize, settings, false);
  drawFoods(ctx, state.foods.filter(food => food.kind === 'meat'), cellSize, settings);
  drawSnakes(ctx, state.snakes, cellSize, settings, true);

  if (
    options.playerMarkerElapsedMs !== undefined
    && options.playerMarkerElapsedMs < PLAYER_MARKER_DURATION_MS
  ) {
    drawPlayerMarkers(
      ctx,
      state.snakes,
      cellSize,
      canvasWidth,
      canvasHeight,
      settings,
      options.playerMarkerElapsedMs
    );
  }
  ctx.restore();
}

/* ====== Food ====== */

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

    if (food.kind === 'apple' || food.kind === 'chicken' || food.kind === 'meat') {
      let icon: string;
      let iconScale = 1;
      if (food.kind === 'apple') {
        icon = phase === 'young' ? '🍏' : '🍎';
        iconScale = phase === 'young' ? 0.72 : 1;
      } else if (food.kind === 'chicken') {
        icon = phase === 'young' ? '🥚' : phase === 'adult' ? '🐤' : '🐔';
        iconScale = phase === 'young' ? 0.78 : 0.92;
      } else {
        icon = '🍖';
        iconScale = 0.9;
      }
      const baseIconSize = Math.max(8, Math.floor(cellSize));

      ctx.save();
      ctx.translate(foodCenterX, foodCenterY + 1);
      const horizontalScale = food.facing === 'right' ? -iconScale : iconScale;
      ctx.scale(horizontalScale, iconScale);
      ctx.font = `${baseIconSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Old apples use filter-based toning: darker and less saturated.
      if (food.kind === 'apple' && phase === 'old') {
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
        color = settings.colorFoodYoung;
        radius = cellSize * 0.28; // smaller
        break;
      case 'adult':
        color = settings.colorFoodAdult;
        radius = cellSize * 0.42; // normal
        break;
      case 'old':
        color = settings.colorFoodOld;
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
  settings: GameSettings,
  drawAlive: boolean
): void {
  for (let snakeIndex = 0; snakeIndex < snakes.length; snakeIndex++) {
    const snake = snakes[snakeIndex];
    if (snake.alive !== drawAlive) continue;
    const baseColor = settings.snakeColors[snake.id % settings.snakeColors.length];

    if (!snake.alive) {
      // Dead snake — greyed-out body with darker outline, no eyes
      const grey = getDeadSnakeColor(baseColor);
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

function drawPlayerMarkers(
  ctx: CanvasRenderingContext2D,
  snakes: Snake[],
  cellSize: number,
  canvasWidth: number,
  canvasHeight: number,
  settings: GameSettings,
  elapsedMs: number
): void {
  const humanSnakes = snakes.filter(snake => !snake.isBot);
  const radius = Math.max(7, cellSize * 0.55);
  const edgePadding = radius + 1;
  const pulse = 0.55 + 0.45 * (
    0.5 + 0.5 * Math.cos((elapsedMs / PLAYER_MARKER_PULSE_MS) * Math.PI * 2)
  );

  for (let playerIndex = 0; playerIndex < humanSnakes.length; playerIndex++) {
    const snake = humanSnakes[playerIndex];
    const head = snake.segments[0];
    if (!head) continue;

    const baseColor = settings.snakeColors[snake.id % settings.snakeColors.length];
    const markerColor = snake.alive ? baseColor : getDeadSnakeColor(baseColor);
    const markerX = Math.max(
      edgePadding,
      Math.min(canvasWidth - edgePadding, head.x * cellSize - radius * 0.35)
    );
    const markerY = Math.max(
      edgePadding,
      Math.min(canvasHeight - edgePadding, head.y * cellSize - radius * 0.35)
    );

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = settings.colorBg;
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = Math.max(2, cellSize * 0.12);
    ctx.beginPath();
    ctx.arc(markerX, markerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = markerColor;
    ctx.font = `bold ${Math.max(10, Math.floor(radius * 1.35))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(playerIndex + 1), markerX, markerY + 0.5);
    ctx.restore();
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
