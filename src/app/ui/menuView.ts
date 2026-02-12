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
    <div style="text-align: center; padding: 40px;">
      <h1 style="color: #0f0; font-size: 2.5em; margin-bottom: 30px;">
        🐍 Змейка ест кроликов 🐇
      </h1>

      <div style="display: inline-block; background: #111; padding: 30px 40px; border-radius: 12px; border: 1px solid #333;">
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; align-items: center;">

          <span style="text-align: right;">Игроки (0–2):</span>
          <input type="number" id="playerCount" min="0" max="2" value="1"
            style="width: 60px; background:#222; color:#fff; border:1px solid #555; padding: 5px 8px; border-radius: 4px; justify-self: end;">

          <span style="text-align: right;">Боты (0–4):</span>
          <input type="number" id="botCount" min="0" max="4" value="0"
            style="width: 60px; background:#222; color:#fff; border:1px solid #555; padding: 5px 8px; border-radius: 4px; justify-self: end;">

          <span style="text-align: right;">Имя игрока 1:</span>
          <div style="display: flex; gap: 4px; justify-self: end; position: relative;">
            <input type="text" id="player1Name" value="Игрок 1"
              style="width: 160px; background:#222; color:#fff; border:1px solid #555; padding: 5px 8px; border-radius: 4px;">
            <button class="name-dropdown-btn" data-target="player1Name" type="button"
              style="background:#333; color:#fff; border:1px solid #555; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.9em;"
              title="Выбрать из сохранённых">▼</button>
            <div class="name-dropdown-list" data-for="player1Name"
              style="display:none; position:absolute; top:100%; right:0; background:#222; border:1px solid #555; border-radius: 4px; max-height: 150px; overflow-y: auto; z-index: 10; min-width: 200px; margin-top: 2px;">
            </div>
          </div>

          <span style="text-align: right;">Имя игрока 2:</span>
          <div style="display: flex; gap: 4px; justify-self: end; position: relative;">
            <input type="text" id="player2Name" value="Игрок 2"
              style="width: 160px; background:#222; color:#fff; border:1px solid #555; padding: 5px 8px; border-radius: 4px;">
            <button class="name-dropdown-btn" data-target="player2Name" type="button"
              style="background:#333; color:#fff; border:1px solid #555; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.9em;"
              title="Выбрать из сохранённых">▼</button>
            <div class="name-dropdown-list" data-for="player2Name"
              style="display:none; position:absolute; top:100%; right:0; background:#222; border:1px solid #555; border-radius: 4px; max-height: 150px; overflow-y: auto; z-index: 10; min-width: 200px; margin-top: 2px;">
            </div>
          </div>

          <span style="text-align: right;">Сложность (1–10):</span>
          <input type="number" id="difficulty" min="1" max="10" value="5"
            style="width: 60px; background:#222; color:#fff; border:1px solid #555; padding: 5px 8px; border-radius: 4px; justify-self: end;">

        </div>

        <div style="text-align: center; margin-top: 24px;">
          <button id="startBtn"
            style="padding: 12px 50px; font-size: 1.2em; background: #0a0; color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
            СТАРТ
          </button>
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
      if (dropdown.style.display === 'none') {
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
    dropdown.innerHTML = `
      <div style="padding: 8px 12px; color: #888; font-size: 0.85em;">
        Нет сохранённых имён
      </div>
    `;
    return;
  }

  dropdown.innerHTML = names.map(name => `
    <div class="name-option" data-name="${name}"
      style="padding: 6px 12px; cursor: pointer; font-size: 0.9em; border-bottom: 1px solid #333;"
      onmouseover="this.style.background='#444'" onmouseout="this.style.background='transparent'">
      ${name}
    </div>
  `).join('');

  dropdown.querySelectorAll('.name-option').forEach(option => {
    option.addEventListener('click', () => {
      const name = (option as HTMLElement).getAttribute('data-name')!;
      const input = container.querySelector(`#${inputId}`) as HTMLInputElement;
      input.value = name;
      dropdown.style.display = 'none';
    });
  });
}
