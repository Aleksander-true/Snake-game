import { GameState, Snake } from '../../../engine/types';
import { getOverallWinner } from '../../../engine/systems/levelSystem';
import { getScores } from '../../../storage/scoreStorage';
import { escapeHtml } from '../shared/escapeHtml';

function sortByFinalPlace(snakes: Snake[]): Snake[] {
  return [...snakes].sort((left, right) =>
    right.levelsWon - left.levelsWon
    || right.score - left.score
    || left.id - right.id
  );
}

function buildFinalTable(state: GameState, ranking: Snake[]): string {
  const foodTotals = new Map<number, number>();
  for (const round of state.roundResults) {
    for (const snake of round.snakes) {
      foodTotals.set(snake.snakeId, (foodTotals.get(snake.snakeId) ?? 0) + snake.foodsEaten);
    }
  }

  const rows = ranking.map((snake, index) => {
    const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(snake.name)}</td>
        <td>${snake.isBot ? 'Бот' : 'Игрок'}</td>
        <td>${foodTotals.get(snake.id) ?? 0}</td>
        <td>${snake.levelsWon}</td>
        <td>${snake.score}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="results-table-scroll">
      <table class="results-table results-final-table">
        <thead>
          <tr>
            <th>Место</th><th>Имя</th><th>Участник</th><th>Съедено</th>
            <th>Победы</th><th>Очки</th><th>Статус</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildWinnerAnnouncement(state: GameState, ranking: Snake[]): string {
  const winner = getOverallWinner(state.snakes);
  if (winner) {
    return `Победитель: ${escapeHtml(winner.name)} — ${winner.levelsWon} побед, ${winner.score} очков`;
  }

  if (ranking.length === 0) return 'Победитель не определён';
  const leaders = ranking.filter(snake =>
    snake.levelsWon === ranking[0].levelsWon && snake.score === ranking[0].score
  );
  return `Ничья: ${leaders.map(snake => escapeHtml(snake.name)).join(', ')}`;
}

function buildPodiumPlace(snake: Snake | undefined, place: 1 | 2 | 3): string {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const labels = { 1: 'Первое место', 2: 'Второе место', 3: 'Третье место' };
  if (!snake) {
    return `<div class="podium-place podium-place--${place} podium-place--empty" aria-hidden="true"></div>`;
  }

  return `
    <div class="podium-place podium-place--${place}">
      <span class="podium-medal" aria-hidden="true">${medals[place]}</span>
      <strong>${labels[place]}</strong>
      <span class="podium-name">${escapeHtml(snake.name)}</span>
      <span>${snake.levelsWon} побед · ${snake.score} очков</span>
    </div>
  `;
}

function buildPodium(ranking: Snake[]): string {
  return `
    <div class="results-podium" aria-label="Пьедестал победителей">
      ${buildPodiumPlace(ranking[2], 3)}
      ${buildPodiumPlace(ranking[0], 1)}
      ${buildPodiumPlace(ranking[1], 2)}
    </div>
  `;
}

/** Render the results screen. */
export function renderResults(
  container: HTMLElement,
  state: GameState,
  onRestart: () => void,
  onMenu: () => void
): void {
  const ranking = sortByFinalPlace(state.snakes);
  const scores = getScores();
  const scoreRows = scores.slice(0, 10).map((scoreRecord, scoreIndex) => `
    <tr>
      <td>${scoreIndex + 1}</td>
      <td>${escapeHtml(scoreRecord.playerName)}</td>
      <td>${scoreRecord.score}</td>
      <td>${scoreRecord.date}</td>
    </tr>
  `).join('');
  const highScores = scoreRows ? `
    <section class="results-summary-section" aria-labelledby="high-scores-title">
      <h3 id="high-scores-title">Таблица рекордов</h3>
      <div class="results-table-scroll">
        <table class="results-table results-high-scores-table">
          <thead><tr><th>#</th><th>Имя</th><th>Очки</th><th>Дата</th></tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
      </div>
    </section>
  ` : '';

  container.innerHTML = `
    <main class="results-wrapper">
      <h2 class="results-title">Итоговые результаты</h2>
      <p class="results-winner">${buildWinnerAnnouncement(state, ranking)}</p>
      ${buildPodium(ranking)}

      <div class="results-summary-grid">
        <section class="results-summary-section" aria-labelledby="participants-title">
          <h3 id="participants-title">Участники</h3>
          ${buildFinalTable(state, ranking)}
        </section>
        ${highScores}
      </div>

      <div class="results-buttons">
        <button id="restartBtn" class="btn btn-restart">Заново</button>
        <button id="menuBtn" class="btn btn-secondary">Меню</button>
      </div>
    </main>
  `;

  container.querySelector<HTMLButtonElement>('#restartBtn')?.addEventListener('click', onRestart);
  container.querySelector<HTMLButtonElement>('#menuBtn')?.addEventListener('click', onMenu);
}
