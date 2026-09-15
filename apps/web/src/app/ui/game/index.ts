import { getCumulativeTargetScore } from '@snake-game/core';
import type { GameSettings, GameState, Snake } from '@snake-game/core';
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

function renderFastForwardControl(
  container: HTMLElement,
  humanSnakes: Snake[],
  botSnakes: Snake[],
  state: GameState,
  onFastForward?: () => void
): void {
  const existingButton = container.querySelector<HTMLButtonElement>('.hud-fast-forward-button');
  if (!canFinishGameEarly(humanSnakes, botSnakes, state)) {
    existingButton?.remove();
    return;
  }
  if (existingButton) return;

  const fastForwardButton = document.createElement('button');
  fastForwardButton.type = 'button';
  fastForwardButton.className = 'btn btn-primary hud-fast-forward-button';
  fastForwardButton.textContent = 'Быстро доиграть';
  if (onFastForward) fastForwardButton.addEventListener('click', onFastForward);
  container.appendChild(fastForwardButton);
  fastForwardButton.focus();
}

/**
 * Render the in-game HUD.
 *  - Top bar: level, target, time, pause hint
 *  - Left column: player 1 and player 2 stats
 *  - Right column: bot stats
 */
export function renderHUD(
  topBar: HTMLElement,
  player1Panel: HTMLElement | null,
  player2Panel: HTMLElement | null,
  botsPanel: HTMLElement | null,
  fastForwardSlot: HTMLElement | null,
  state: GameState,
  paused: boolean,
  settings: GameSettings,
  onFastForward?: () => void
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

  if (player1Panel) {
    const player1 = humanSnakes[0];
    const player1Section = player1Panel.closest<HTMLElement>('.game-player-section');
    if (player1Section) player1Section.hidden = !player1;
    renderSnakeStats(player1Panel, player1 ? [player1] : [], settings);
  }

  if (player2Panel) {
    const player2 = humanSnakes[1];
    const player2Section = player2Panel.closest<HTMLElement>('.game-player-section');
    if (player2Section) player2Section.hidden = !player2;
    renderSnakeStats(player2Panel, player2 ? [player2] : [], settings);
  }

  if (botsPanel) {
    renderSnakeStats(botsPanel, botSnakes, settings);
  }

  const playersPanel = player1Panel?.closest<HTMLElement>('.game-players-panel');
  if (playersPanel) playersPanel.hidden = humanSnakes.length === 0;

  if (fastForwardSlot) {
    renderFastForwardControl(fastForwardSlot, humanSnakes, botSnakes, state, onFastForward);
  }
}
