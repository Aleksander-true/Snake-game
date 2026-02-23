import { GameState, Snake } from '../../../engine/types';
import { GameSettings } from '../../../engine/settings';
import { getCumulativeTargetScore } from '../../../engine/formulas';
import { getScores } from '../../../storage/scoreStorage';

/* ================================================================
 *  Shared overlay helpers
 * ================================================================ */

const OVERLAY_ID = 'modal-overlay';
const GAME_AREA_ID = 'game-area';

/** The container for the overlay — #game-area if present, otherwise document.body. */
function getOverlayParent(): HTMLElement {
  return document.getElementById(GAME_AREA_ID) || document.body;
}

/** Remove any existing modal overlay. */
export function hideModal(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

/** Return true if any modal is currently visible. */
export function isModalVisible(): boolean {
  return document.getElementById(OVERLAY_ID) !== null;
}

/** Create base overlay element (dark semi-transparent background). */
function createOverlay(): HTMLDivElement {
  hideModal(); // ensure no duplicate
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'modal-overlay';
  return overlay;
}

/* ================================================================
 *  Pause modal
 * ================================================================ */

export function showPauseModal(onResume: () => void): void {
  const overlay = createOverlay();

  overlay.innerHTML = `
    <div class="modal-box">
      <h2 class="modal-title">⏸ ПАУЗА</h2>
      <p class="modal-hint">Нажмите <kbd>Пробел</kbd> или кнопку ниже</p>
      <button class="btn btn-primary modal-btn" id="modal-resume">▶ Продолжить</button>
    </div>`;

  getOverlayParent().appendChild(overlay);

  // Click button
  overlay.querySelector('#modal-resume')!.addEventListener('click', onResume);
  // Click overlay background (outside the box)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onResume();
  });
}

/* ================================================================
 *  Confirm modal (Yes / No)
 * ================================================================ */

export function showConfirmModal(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel: () => void,
  confirmLabel = 'Да',
  cancelLabel = 'Нет'
): void {
  const overlay = createOverlay();

  overlay.innerHTML = `
    <div class="modal-box">
      <h2 class="modal-title">${title}</h2>
      <p class="modal-subtitle">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-primary modal-btn" id="modal-confirm">${confirmLabel}</button>
        <button class="btn btn-secondary modal-btn" id="modal-cancel">${cancelLabel}</button>
      </div>
      <p class="modal-hint"><kbd>Enter</kbd> — подтвердить, <kbd>Esc</kbd> — отменить</p>
    </div>`;

  getOverlayParent().appendChild(overlay);

  overlay.querySelector('#modal-confirm')!.addEventListener('click', onConfirm);
  overlay.querySelector('#modal-cancel')!.addEventListener('click', onCancel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onCancel();
  });
}

/* ================================================================
 *  Level complete modal
 * ================================================================ */

export function showLevelCompleteModal(
  state: GameState,
  onContinue: () => void,
  settings: GameSettings,
): void {
  const overlay = createOverlay();

  const target = getCumulativeTargetScore(state.level, settings);

  const snakeRows = state.snakes.map(snake => snakeResultRow(snake)).join('');

  overlay.innerHTML = `
    <div class="modal-box modal-box--wide">
      <h2 class="modal-title">Уровень ${state.level} завершён</h2>
      <p class="modal-subtitle">Цель: ${target} очков</p>
      <table class="modal-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Очки</th>
            <th>Длина</th>
            <th>Победы</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${snakeRows}
        </tbody>
      </table>
      <button class="btn btn-primary modal-btn" id="modal-continue">▶ Продолжить</button>
      <p class="modal-hint">или нажмите <kbd>Пробел</kbd></p>
    </div>`;

  getOverlayParent().appendChild(overlay);

  overlay.querySelector('#modal-continue')!.addEventListener('click', onContinue);
}

/* ================================================================
 *  Game over modal
 * ================================================================ */

export function showGameOverModal(
  state: GameState,
  onRestart: () => void,
  onMenu: () => void,
): void {
  const overlay = createOverlay();

  const snakeRows = state.snakes.map(snake => snakeResultRow(snake)).join('');
  const scores = getScores();
  const scoreRows = scores
    .slice(0, 10)
    .map((scoreRecord, scoreIndex) => `
      <tr>
        <td>${scoreIndex + 1}</td>
        <td>${scoreRecord.playerName}</td>
        <td>${scoreRecord.score}</td>
        <td>${scoreRecord.date}</td>
      </tr>
    `)
    .join('');
  const scoreTable = scoreRows
    ? `
      <h3 class="modal-subtitle">Таблица рекордов</h3>
      <table class="modal-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Имя</th>
            <th>Очки</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          ${scoreRows}
        </tbody>
      </table>
    `
    : '';

  overlay.innerHTML = `
    <div class="modal-box modal-box--wide">
      <h2 class="modal-title modal-title--danger">Игра окончена</h2>
      <table class="modal-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Очки</th>
            <th>Длина</th>
            <th>Победы</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${snakeRows}
        </tbody>
      </table>
      ${scoreTable}
      <div class="modal-actions">
        <button class="btn btn-primary modal-btn" id="modal-restart">Заново</button>
        <button class="btn btn-secondary modal-btn" id="modal-menu">Меню</button>
      </div>
      <p class="modal-hint">или нажмите <kbd>Пробел</kbd> для выхода в меню</p>
    </div>`;

  getOverlayParent().appendChild(overlay);

  overlay.querySelector('#modal-restart')!.addEventListener('click', onRestart);
  overlay.querySelector('#modal-menu')!.addEventListener('click', onMenu);
}

/* ================================================================
 *  Helpers
 * ================================================================ */

function snakeResultRow(snake: Snake): string {
  const statusClass = snake.alive ? 'modal-status-alive' : 'modal-status-dead';
  const status = snake.alive ? 'Жив' : (snake.deathReason || 'Мёртв');
  return `
    <tr>
      <td>${snake.name}</td>
      <td>${snake.score}</td>
      <td>${snake.segments.length}</td>
      <td>${snake.levelsWon}</td>
      <td class="${statusClass}">${status}</td>
    </tr>`;
}
