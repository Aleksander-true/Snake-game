import { GameConfig } from '../../engine/types';
import { renderMenu } from '../ui/menu';
import { heuristicAlgorithmOptions } from '../../heuristic';

export interface MenuScreenCallbacks {
  onStart: (config: GameConfig) => void;
  onStartDevMode: () => void;
  onStartArena: (config: ArenaLaunchConfig) => void;
  /** Headless training lab: browser UI for arena metrics and future ML steps. */
  onStartTraining: (config: TrainingLaunchConfig) => void;
}

export interface ArenaLaunchConfig {
  snakeCount: number;
  difficultyLevel: number;
  speedMultiplier: 1 | 2 | 4 | 8;
  seed: number;
  algorithmIds: string[];
}

/**
 * Parameters for a single headless arena run from the training lab (one bot, no live canvas).
 */
export interface TrainingLaunchConfig {
  seed: number;
  level: number;
  difficultyLevel: number;
  maxTicks: number;
  gameMode: 'classic' | 'survival';
}

/** Defaults when opening the training lab from the dev menu (parameters are editable on the lab screen). */
export function getDefaultTrainingLaunchConfig(): TrainingLaunchConfig {
  return {
    seed: 1,
    level: 1,
    difficultyLevel: 1,
    maxTicks: 50_000,
    gameMode: 'classic',
  };
}

/**
 * Handles menu rendering and menu-specific interactions.
 */
export class MenuScreenService {
  constructor(private readonly appRoot: HTMLElement) {}

  show(callbacks: MenuScreenCallbacks): void {
    renderMenu(this.appRoot, callbacks.onStart);
    if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
      this.attachDevModeButton(callbacks.onStartDevMode);
      this.attachArenaButton(callbacks.onStartArena);
      this.attachTrainingButton(callbacks.onStartTraining);
    }
  }

  readCurrentMenuConfig(): GameConfig {
    const playerCountInputValue = parseInt((document.getElementById('playerCount') as HTMLInputElement)?.value ?? '1', 10);
    const botCountInputValue = parseInt((document.getElementById('botCount') as HTMLInputElement)?.value ?? '0', 10);
    const player1NameInputValue = (document.getElementById('player1Name') as HTMLInputElement)?.value || 'Игрок 1';
    const player2NameInputValue = (document.getElementById('player2Name') as HTMLInputElement)?.value || 'Игрок 2';
    const difficultyInputValue = parseInt((document.getElementById('difficulty') as HTMLInputElement)?.value ?? '1', 10);
    const modeValue = (document.getElementById('gameMode') as HTMLSelectElement)?.value ?? 'classic';

    const playerCount = Math.max(0, Math.min(2, playerCountInputValue));
    let botCount = Math.max(0, Math.min(4, botCountInputValue));
    if (playerCount + botCount === 0) {
      botCount = 1;
    }

    return {
      playerCount,
      botCount,
      playerNames: [player1NameInputValue, player2NameInputValue],
      difficultyLevel: Math.max(1, Math.min(10, difficultyInputValue)),
      gameMode: modeValue === 'survival' ? 'survival' : 'classic',
    };
  }

  private attachDevModeButton(onClick: () => void): void {
    const menuPanel = this.appRoot.querySelector('.menu-panel');
    if (!menuPanel || this.appRoot.querySelector('#devModeBtn')) return;

    const devModeRow = document.createElement('div');
    devModeRow.className = 'menu-dev-row';
    devModeRow.innerHTML = `<button id="devModeBtn" class="btn btn-dev">🛠 Режим настройки</button>`;
    menuPanel.appendChild(devModeRow);

    devModeRow.querySelector('#devModeBtn')!.addEventListener('click', onClick);
  }

  private attachArenaButton(onStartArena: (config: ArenaLaunchConfig) => void): void {
    const menuPanel = this.appRoot.querySelector('.menu-panel');
    if (!menuPanel || this.appRoot.querySelector('#arenaModeBtn')) return;

    const arenaRow = document.createElement('div');
    arenaRow.className = 'menu-dev-row';
    arenaRow.innerHTML = `
      <button id="arenaModeBtn" class="btn btn-dev">🤖 Арена ИИ</button>
      <div id="arenaConfigPanel" class="arena-config-panel arena-config-panel--hidden"></div>
    `;
    menuPanel.appendChild(arenaRow);

    const toggleButton = arenaRow.querySelector('#arenaModeBtn') as HTMLButtonElement;
    const panel = arenaRow.querySelector('#arenaConfigPanel') as HTMLElement;
    toggleButton.addEventListener('click', () => {
      const hidden = panel.classList.contains('arena-config-panel--hidden');
      panel.classList.toggle('arena-config-panel--hidden', !hidden);
      if (hidden) {
        this.renderArenaConfigPanel(panel, onStartArena);
      }
    });
  }

  /**
   * Training lab: single button navigates straight to the lab screen (defaults from getDefaultTrainingLaunchConfig).
   */
  private attachTrainingButton(onStartTraining: (config: TrainingLaunchConfig) => void): void {
    const menuPanel = this.appRoot.querySelector('.menu-panel');
    if (!menuPanel || this.appRoot.querySelector('#trainingLabBtn')) return;

    const trainingRow = document.createElement('div');
    trainingRow.className = 'menu-dev-row';
    trainingRow.innerHTML = `
      <button id="trainingLabBtn" type="button" class="btn btn-dev">🧪 Лаборатория обучения</button>
    `;
    menuPanel.appendChild(trainingRow);

    trainingRow.querySelector('#trainingLabBtn')!.addEventListener('click', () => {
      onStartTraining(getDefaultTrainingLaunchConfig());
    });
  }

  private renderArenaConfigPanel(
    panel: HTMLElement,
    onStartArena: (config: ArenaLaunchConfig) => void
  ): void {
    panel.innerHTML = `
      <h3 class="arena-config-title">Запуск арены</h3>
      <div class="arena-config-grid">
        <span class="menu-label">Змеек (1-6):</span>
        <input id="arenaSnakeCount" type="number" min="1" max="6" value="4" class="input-field input-number">

        <span class="menu-label">Сложность:</span>
        <input id="arenaDifficulty" type="number" min="1" max="10" value="1" class="input-field input-number">

        <span class="menu-label">Скорость:</span>
        <select id="arenaSpeed" class="input-field input-select">
          <option value="1">1x</option>
          <option value="2" selected>2x</option>
          <option value="4">4x</option>
          <option value="8">8x</option>
        </select>

        <span class="menu-label">Seed:</span>
        <input id="arenaSeed" type="number" min="1" step="1" value="1" class="input-field input-number">
      </div>
      <div id="arenaAlgorithmsList" class="arena-algorithms-list"></div>
      <div class="arena-config-actions">
        <button id="arenaStartBtn" class="btn btn-primary btn-small">▶ Запустить арену</button>
      </div>
    `;

    const snakeCountInput = panel.querySelector('#arenaSnakeCount') as HTMLInputElement;
    const algorithmsList = panel.querySelector('#arenaAlgorithmsList') as HTMLElement;
    const renderAlgorithmSelectors = () => {
      const rawCount = parseInt(snakeCountInput.value || '4', 10);
      const snakeCount = Math.max(1, Math.min(6, rawCount));
      snakeCountInput.value = String(snakeCount);
      algorithmsList.innerHTML = this.buildAlgorithmRowsHtml(snakeCount);
    };
    snakeCountInput.addEventListener('input', renderAlgorithmSelectors);
    renderAlgorithmSelectors();

    const startButton = panel.querySelector('#arenaStartBtn') as HTMLButtonElement;
    startButton.addEventListener('click', () => {
      const algorithmIds = this.readAlgorithmIds(panel);
      const rawSnakeCount = parseInt(snakeCountInput.value || '4', 10);
      const rawDifficulty = parseInt((panel.querySelector('#arenaDifficulty') as HTMLInputElement).value || '1', 10);
      const rawSeed = parseInt((panel.querySelector('#arenaSeed') as HTMLInputElement).value || '1', 10);
      const rawSpeed = parseInt((panel.querySelector('#arenaSpeed') as HTMLSelectElement).value || '2', 10);

      const speed = ([1, 2, 4, 8] as const).includes(rawSpeed as 1 | 2 | 4 | 8)
        ? (rawSpeed as 1 | 2 | 4 | 8)
        : 2;

      onStartArena({
        snakeCount: Math.max(1, Math.min(6, rawSnakeCount)),
        difficultyLevel: Math.max(1, Math.min(10, rawDifficulty)),
        speedMultiplier: speed,
        seed: Math.max(1, rawSeed),
        algorithmIds,
      });
    });
  }

  private buildAlgorithmRowsHtml(snakeCount: number): string {
    const optionHtml = heuristicAlgorithmOptions
      .map(option => `<option value="${option.id}">${option.label}</option>`)
      .join('');
    const rows: string[] = [];
    for (let snakeNumber = 1; snakeNumber <= snakeCount; snakeNumber++) {
      rows.push(`
        <div class="arena-alg-row">
          <span class="arena-alg-label">Змейка ${snakeNumber}:</span>
          <select class="input-field input-select arena-alg-select" data-snake="${snakeNumber}">
            ${optionHtml}
          </select>
        </div>
      `);
    }
    return rows.join('');
  }

  private readAlgorithmIds(panel: HTMLElement): string[] {
    const selects = panel.querySelectorAll('.arena-alg-select');
    const result: string[] = [];
    selects.forEach(selectElement => {
      result.push((selectElement as HTMLSelectElement).value);
    });
    return result;
  }
}
