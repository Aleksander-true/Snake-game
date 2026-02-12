import { GameState, Snake } from '../../engine/types';
import { getCumulativeTargetScore } from '../../engine/game';

/**
 * Render a single snake stats block.
 */
function snakeStatsHTML(snake: Snake): string {
  const cssClass = snake.alive ? 'hud-snake-alive' : 'hud-snake-dead';
  const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
  return `
    <div class="${cssClass}">
      <strong>${snake.name}</strong><br>
      Очки: ${snake.score}<br>
      Длина: ${snake.segments.length}<br>
      Победы: ${snake.levelsWon}<br>
      ${status}
    </div>
  `;
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
  paused: boolean
): void {
  const minutes = Math.floor(state.levelTimeLeft / 60);
  const seconds = state.levelTimeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const cumulativeTarget = getCumulativeTargetScore(state.level);

  topBar.innerHTML = `
    <div class="hud-bar">
      <span>Уровень: ${state.level}</span>
      <span>Цель: ${cumulativeTarget}</span>
      <span>Время: ${timeStr}</span>
      <span>Тик: ${state.tickCount}</span>
      ${paused ? '<span class="hud-paused">⏸ ПАУЗА (пробел)</span>' : '<span class="hud-hint">Пробел — пауза</span>'}
    </div>
  `;

  // Separate snakes into humans (ordered) and bots
  const humans = state.snakes.filter(s => !s.isBot);
  const bots = state.snakes.filter(s => s.isBot);

  // Left panel → player 1 (first human)
  if (leftPanel) {
    leftPanel.innerHTML = humans[0] ? snakeStatsHTML(humans[0]) : '';
  }

  // Right panel → player 2 (second human)
  if (rightPanel) {
    rightPanel.innerHTML = humans[1] ? snakeStatsHTML(humans[1]) : '';
  }

  // Bottom panel → all bots
  if (bottomPanel) {
    if (bots.length > 0) {
      bottomPanel.innerHTML = bots.map(b => snakeStatsHTML(b)).join('');
    } else {
      bottomPanel.innerHTML = '';
    }
  }
}
