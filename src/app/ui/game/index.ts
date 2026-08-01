import { GameState, Snake } from '../../../engine/types';
import { GameSettings } from '../../../engine/settings';
import { getCumulativeTargetScore } from '../../../engine/formulas';
import { getDeadSnakeColor } from '../../../shared/color';
import { escapeHtml } from '../shared/escapeHtml';

/**
 * Render a single snake stats block.
 */
function buildSnakeStatsHtml(snake: Snake): string {
  const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
  return `
    <div class="hud-snake-stats">
      <strong>${escapeHtml(snake.name)}</strong><br>
      Очки: ${snake.score}<br>
      Длина: ${snake.segments.length}<br>
      Победы: ${snake.levelsWon}<br>
      ${escapeHtml(status)}
    </div>
  `;
}

function renderSnakeStats(container: HTMLElement, snakes: Snake[], settings: GameSettings): void {
  container.innerHTML = snakes.map(buildSnakeStatsHtml).join('');
  const statsElements = container.querySelectorAll<HTMLElement>('.hud-snake-stats');
  statsElements.forEach((statsElement, index) => {
    const snake = snakes[index];
    const baseColor = settings.snakeColors[snake.id % settings.snakeColors.length];
    const displayColor = snake.alive ? baseColor : getDeadSnakeColor(baseColor);
    statsElement.style.setProperty('--hud-snake-color', displayColor);
  });
}

function canFinishGameEarly(humanSnakes: Snake[], botSnakes: Snake[], state: GameState): boolean {
  return humanSnakes.length > 0
    && humanSnakes.every(snake => !snake.alive)
    && botSnakes.some(snake => snake.alive)
    && !state.levelComplete
    && !state.gameOver;
}

/**
 * Render the in-game HUD.
 *  - Top bar: level, target, time, pause hint
 *  - Left panel: player 1 stats
 *  - Right panel: player 2 stats
 *  - Bottom panel: bot stats
 */
export function renderHUD(
  topBar: HTMLElement,
  leftPanel: HTMLElement | null,
  rightPanel: HTMLElement | null,
  bottomPanel: HTMLElement | null,
  state: GameState,
  paused: boolean,
  settings: GameSettings,
  onFinishGame?: () => void
): void {
  const minutes = Math.floor(state.levelTimeLeft / 60);
  const seconds = state.levelTimeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const cumulativeTarget = getCumulativeTargetScore(state.level, settings);
  const showTimer = state.snakes.length > 1;
  const timerCell = showTimer ? `<span>Время: ${timeStr}</span>` : '';

  topBar.innerHTML = `
    <div class="hud-bar">
      <span>Уровень: ${state.level}</span>
      <span>Цель: ${cumulativeTarget}</span>
      ${timerCell}
      <span>Тик: ${state.tickCount}</span>
      ${paused ? '<span class="hud-paused">⏸ ПАУЗА (пробел)</span>' : '<span class="hud-hint">Пробел — пауза</span>'}
    </div>
  `;

  // Separate snakes into humans (ordered) and bots
  const humanSnakes = state.snakes.filter(snake => !snake.isBot);
  const botSnakes = state.snakes.filter(snake => snake.isBot);

  // Left panel → player 1 (first human)
  if (leftPanel) {
    renderSnakeStats(leftPanel, humanSnakes.slice(0, 1), settings);
    if (canFinishGameEarly(humanSnakes, botSnakes, state)) {
      const finishButton = document.createElement('button');
      finishButton.type = 'button';
      finishButton.className = 'btn btn-secondary hud-finish-button';
      finishButton.textContent = 'Завершить игру';
      if (onFinishGame) finishButton.addEventListener('click', onFinishGame);
      leftPanel.appendChild(finishButton);
    }
  }

  // Right panel → player 2 (second human)
  if (rightPanel) {
    renderSnakeStats(rightPanel, humanSnakes.slice(1, 2), settings);
  }

  // Bottom panel → all bots
  if (bottomPanel) {
    renderSnakeStats(bottomPanel, botSnakes, settings);
  }
}
