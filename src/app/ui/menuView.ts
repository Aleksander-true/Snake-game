import { GameConfig } from '../../engine/types';
import { getSavedNames, saveName } from '../../storage/scoreStorage';

/**
 * Render the main menu and return config on start.
 */
export function renderMenu(
  container: HTMLElement,
  onStart: (config: GameConfig) => void
): void {
  container.innerHTML = `
    <div class="menu-wrapper">
      <h1 class="menu-title">🐍 Змейка ест кроликов 🐇</h1>

      <div class="menu-panel">
        <div class="menu-grid">

          <span class="menu-label">Игроки (0–2):</span>
          <input type="number" id="playerCount" min="0" max="2" value="1"
            class="input-field input-number">

          <span class="menu-label">Боты (0–4):</span>
          <input type="number" id="botCount" min="0" max="4" value="0"
            class="input-field input-number">

          <span class="menu-label">Имя игрока 1:</span>
          <div class="name-input-group">
            <input type="text" id="player1Name" value="Игрок 1"
              class="input-field input-text">
            <button class="name-dropdown-btn" data-target="player1Name" type="button"
              title="Выбрать из сохранённых">▼</button>
            <div class="name-dropdown-list" data-for="player1Name"></div>
          </div>

          <span class="menu-label">Имя игрока 2:</span>
          <div class="name-input-group">
            <input type="text" id="player2Name" value="Игрок 2"
              class="input-field input-text">
            <button class="name-dropdown-btn" data-target="player2Name" type="button"
              title="Выбрать из сохранённых">▼</button>
            <div class="name-dropdown-list" data-for="player2Name"></div>
          </div>

          <span class="menu-label">Сложность (1–10):</span>
          <input type="number" id="difficulty" min="1" max="10" value="1"
            class="input-field input-number">

        </div>

        <div class="menu-start-row">
          <button id="startBtn" class="btn btn-primary">СТАРТ</button>
        </div>
      </div>
    </div>
  `;

  // --- Dropdown logic ---
  setupNameDropdowns(container);

  // --- Start button ---
  const startBtn = container.querySelector('#startBtn') as HTMLButtonElement;
  startBtn.addEventListener('click', () => {
    const playerCount = parseInt((container.querySelector('#playerCount') as HTMLInputElement).value) || 0;
    const botCount = parseInt((container.querySelector('#botCount') as HTMLInputElement).value) || 0;
    const player1Name = (container.querySelector('#player1Name') as HTMLInputElement).value || 'Игрок 1';
    const player2Name = (container.querySelector('#player2Name') as HTMLInputElement).value || 'Игрок 2';
    const difficulty = parseInt((container.querySelector('#difficulty') as HTMLInputElement).value) || 5;

    // Save names to localStorage
    if (playerCount >= 1) saveName(player1Name);
    if (playerCount >= 2) saveName(player2Name);

    const config: GameConfig = {
      playerCount: Math.min(2, Math.max(0, playerCount)),
      botCount: Math.min(4, Math.max(0, botCount)),
      playerNames: [player1Name, player2Name],
      difficultyLevel: Math.min(10, Math.max(1, difficulty)),
    };

    onStart(config);
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.name-dropdown-btn') && !target.closest('.name-dropdown-list')) {
      container.querySelectorAll('.name-dropdown-list').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    }
  });
}

function setupNameDropdowns(container: HTMLElement): void {
  const buttons = container.querySelectorAll('.name-dropdown-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = (btn as HTMLElement).getAttribute('data-target')!;
      const dropdown = container.querySelector(`.name-dropdown-list[data-for="${targetId}"]`) as HTMLElement;

      // Close all other dropdowns
      container.querySelectorAll('.name-dropdown-list').forEach(el => {
        if (el !== dropdown) (el as HTMLElement).style.display = 'none';
      });

      // Toggle this one
      if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        populateDropdown(dropdown, targetId, container);
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    });
  });
}

function populateDropdown(dropdown: HTMLElement, inputId: string, container: HTMLElement): void {
  const names = getSavedNames();

  if (names.length === 0) {
    dropdown.innerHTML = `<div class="name-dropdown-empty">Нет сохранённых имён</div>`;
    return;
  }

  dropdown.innerHTML = names.map(name =>
    `<div class="name-option" data-name="${name}">${name}</div>`
  ).join('');

  dropdown.querySelectorAll('.name-option').forEach(option => {
    option.addEventListener('click', () => {
      const name = (option as HTMLElement).getAttribute('data-name')!;
      const input = container.querySelector(`#${inputId}`) as HTMLInputElement;
      input.value = name;
      dropdown.style.display = 'none';
    });
  });
}
