import { GameConfig } from '../../../engine/types';
import { getSavedNames, saveName } from '../../../storage/scoreStorage';

let outsideClickHandler: ((event: MouseEvent) => void) | null = null;

/**
 * Render the main menu and return config on start.
 */
export function renderMenu(
  container: HTMLElement,
  onStart: (config: GameConfig) => void
): void {
  container.innerHTML = `
    <div class="menu-wrapper">
      <h1 class="menu-title">Голодные змейки 🐍</h1>

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

          <span class="menu-label">Режим:</span>
          <select id="gameMode" class="input-field input-select">
            <option value="classic" selected>Классика</option>
            <option value="survival">Выживание</option>
          </select>

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
    const difficulty = parseInt((container.querySelector('#difficulty') as HTMLInputElement).value) || 1;
    const modeValue = (container.querySelector('#gameMode') as HTMLSelectElement).value;

    // Save names to localStorage
    if (playerCount >= 1) saveName(player1Name);
    if (playerCount >= 2) saveName(player2Name);

    onStart(normalizeGameConfig(playerCount, botCount, player1Name, player2Name, difficulty, modeValue));
  });

  attachOutsideClickHandler(container);
}

function setupNameDropdowns(container: HTMLElement): void {
  const dropdownButtons = container.querySelectorAll('.name-dropdown-btn');

  dropdownButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const inputId = (button as HTMLElement).getAttribute('data-target')!;
      const dropdownList = container.querySelector(`.name-dropdown-list[data-for="${inputId}"]`) as HTMLElement;

      // Close all other dropdowns
      container.querySelectorAll('.name-dropdown-list').forEach(el => {
        if (el !== dropdownList) (el as HTMLElement).classList.remove('name-dropdown-list--open');
      });

      // Toggle this one
      if (!dropdownList.classList.contains('name-dropdown-list--open')) {
        populateDropdown(dropdownList, inputId, container);
        dropdownList.classList.add('name-dropdown-list--open');
      } else {
        dropdownList.classList.remove('name-dropdown-list--open');
      }
    });
  });
}

function populateDropdown(dropdownList: HTMLElement, inputId: string, container: HTMLElement): void {
  const savedNames = getSavedNames();

  if (savedNames.length === 0) {
    dropdownList.innerHTML = `<div class="name-dropdown-empty">Нет сохранённых имён</div>`;
    return;
  }

  dropdownList.innerHTML = savedNames.map(name =>
    `<div class="name-option" data-name="${name}">${name}</div>`
  ).join('');

  dropdownList.querySelectorAll('.name-option').forEach(option => {
    option.addEventListener('click', () => {
      const selectedName = (option as HTMLElement).getAttribute('data-name')!;
      const nameInput = container.querySelector(`#${inputId}`) as HTMLInputElement;
      nameInput.value = selectedName;
      dropdownList.classList.remove('name-dropdown-list--open');
    });
  });
}

function attachOutsideClickHandler(container: HTMLElement): void {
  if (outsideClickHandler) {
    document.removeEventListener('click', outsideClickHandler);
  }

  outsideClickHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.name-dropdown-btn') && !target.closest('.name-dropdown-list')) {
      container.querySelectorAll('.name-dropdown-list').forEach(el => {
        (el as HTMLElement).classList.remove('name-dropdown-list--open');
      });
    }
  };

  document.addEventListener('click', outsideClickHandler);
}

function normalizeGameConfig(
  rawPlayerCount: number,
  rawBotCount: number,
  player1Name: string,
  player2Name: string,
  rawDifficultyLevel: number,
  rawMode: string
): GameConfig {
  const playerCount = Math.min(2, Math.max(0, rawPlayerCount));
  let botCount = Math.min(4, Math.max(0, rawBotCount));
  if (playerCount + botCount === 0) {
    botCount = 1;
  }

  return {
    playerCount,
    botCount,
    playerNames: [player1Name, player2Name],
    difficultyLevel: Math.min(10, Math.max(1, rawDifficultyLevel)),
    gameMode: rawMode === 'survival' ? 'survival' : 'classic',
  };
}
