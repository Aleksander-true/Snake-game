import { GameState } from '../../engine/types';
import { getScores } from '../../storage/scoreStorage';

/**
 * Render the results screen (all in Russian).
 */
export function renderResults(
  container: HTMLElement,
  state: GameState,
  onRestart: () => void,
  onMenu: () => void
): void {
  const scores = getScores();

  let html = `
    <div style="text-align: center; padding: 40px;">
      <h2 style="color: #0f0; margin-bottom: 20px;">Игра окончена</h2>

      <h3>Результаты</h3>
      <table style="margin: 10px auto; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #555;">
          <th style="padding: 6px 12px;">Имя</th>
          <th style="padding: 6px 12px;">Очки</th>
          <th style="padding: 6px 12px;">Победы</th>
          <th style="padding: 6px 12px;">Статус</th>
        </tr>
  `;

  for (const snake of state.snakes) {
    const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
    html += `
      <tr>
        <td style="padding: 6px 12px;">${snake.name}</td>
        <td style="padding: 6px 12px;">${snake.score}</td>
        <td style="padding: 6px 12px;">${snake.levelsWon}</td>
        <td style="padding: 6px 12px;">${status}</td>
      </tr>
    `;
  }

  html += `</table>`;

  // High scores table
  if (scores.length > 0) {
    html += `
      <h3 style="margin-top: 30px;">Таблица рекордов</h3>
      <table style="margin: 10px auto; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid #555;">
          <th style="padding: 6px 12px;">#</th>
          <th style="padding: 6px 12px;">Имя</th>
          <th style="padding: 6px 12px;">Очки</th>
          <th style="padding: 6px 12px;">Дата</th>
        </tr>
    `;

    for (let i = 0; i < Math.min(scores.length, 10); i++) {
      const s = scores[i];
      html += `
        <tr>
          <td style="padding: 6px 12px;">${i + 1}</td>
          <td style="padding: 6px 12px;">${s.playerName}</td>
          <td style="padding: 6px 12px;">${s.score}</td>
          <td style="padding: 6px 12px;">${s.date}</td>
        </tr>
      `;
    }

    html += `</table>`;
  }

  html += `
    <div style="margin-top: 30px;">
      <button id="restartBtn" style="padding: 10px 30px; margin: 5px; background: #0a0; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Заново</button>
      <button id="menuBtn" style="padding: 10px 30px; margin: 5px; background: #555; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Меню</button>
    </div>
  </div>`;

  container.innerHTML = html;

  (container.querySelector('#restartBtn') as HTMLButtonElement).addEventListener('click', onRestart);
  (container.querySelector('#menuBtn') as HTMLButtonElement).addEventListener('click', onMenu);
}
