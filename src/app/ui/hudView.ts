import { GameState } from '../../engine/types';
import { getTargetScore } from '../../engine/game';

/**
 * Render the in-game HUD (level, time, snake stats).
 */
export function renderHUD(container: HTMLElement, state: GameState): void {
  const minutes = Math.floor(state.levelTimeLeft / 60);
  const seconds = state.levelTimeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const target = getTargetScore(state.level);

  let html = `
    <div style="display: flex; justify-content: space-between; padding: 8px 16px; background: #111; border-bottom: 1px solid #333; font-size: 0.9em;">
      <span>Level: ${state.level}</span>
      <span>Target: ${target}</span>
      <span>Time: ${timeStr}</span>
    </div>
    <div style="display: flex; gap: 20px; padding: 4px 16px; background: #111; font-size: 0.85em;">
  `;

  for (const snake of state.snakes) {
    const statusColor = snake.alive ? '#0f0' : '#f00';
    const status = snake.alive ? 'Alive' : (snake.deathReason || 'Dead');
    html += `
      <span style="color: ${statusColor};">
        ${snake.name}: ${snake.score}pts | len:${snake.segments.length} | ${status}
      </span>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}
