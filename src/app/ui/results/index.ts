import { GameState } from '../../../engine/types';
import { getScores } from '../../../storage/scoreStorage';

/**
 * Render the results screen.
 */
export function renderResults(
  container: HTMLElement,
  state: GameState,
  onRestart: () => void,
  onMenu: () => void
): void {
  const scores = getScores();

  let html = `
    <div class="results-wrapper">
      <h2 class="results-title">Игра окончена</h2>

      <h3>Результаты</h3>
      <table class="results-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Очки</th>
            <th>Победы</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const snake of state.snakes) {
    const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
    html += `
      <tr>
        <td>${snake.name}</td>
        <td>${snake.score}</td>
        <td>${snake.levelsWon}</td>
        <td>${status}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;

  // High scores table
  if (scores.length > 0) {
    html += `
      <h3 class="results-section-title">Таблица рекордов</h3>
      <table class="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Имя</th>
            <th>Очки</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let rankIndex = 0; rankIndex < Math.min(scores.length, 10); rankIndex++) {
      const scoreRecord = scores[rankIndex];
      html += `
        <tr>
          <td>${rankIndex + 1}</td>
          <td>${scoreRecord.playerName}</td>
          <td>${scoreRecord.score}</td>
          <td>${scoreRecord.date}</td>
        </tr>
      `;
    }

    html += `</tbody></table>`;
  }

  html += `
    <div class="results-buttons">
      <button id="restartBtn" class="btn btn-restart">Заново</button>
      <button id="menuBtn" class="btn btn-secondary">Меню</button>
    </div>
  </div>`;

  container.innerHTML = html;

  (container.querySelector('#restartBtn') as HTMLButtonElement).addEventListener('click', onRestart);
  (container.querySelector('#menuBtn') as HTMLButtonElement).addEventListener('click', onMenu);
}
