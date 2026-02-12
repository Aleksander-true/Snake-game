import { GameState } from '../../engine/types';
import { getCumulativeTargetScore } from '../../engine/game';

/**
 * Render the in-game HUD (level, time, snake stats).
 */
export function renderHUD(container: HTMLElement, state: GameState): void {
  const minutes = Math.floor(state.levelTimeLeft / 60);
  const seconds = state.levelTimeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const cumulativeTarget = getCumulativeTargetScore(state.level);

  let html = `
    <div class="hud-bar">
      <span>Уровень: ${state.level}</span>
      <span>Цель: ${cumulativeTarget}</span>
      <span>Время: ${timeStr}</span>
    </div>
    <div class="hud-snakes">
  `;

  for (const snake of state.snakes) {
    const cssClass = snake.alive ? 'hud-snake-alive' : 'hud-snake-dead';
    const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
    html += `
      <span class="${cssClass}">
        ${snake.name}: ${snake.score} очк. | длина: ${snake.segments.length} | ${status}
      </span>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}
