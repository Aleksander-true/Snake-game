import { GameConfig } from '../../engine/types';
import { renderMenu } from '../ui/menu';

export interface MenuScreenCallbacks {
  onStart: (config: GameConfig) => void;
  onStartDevMode: () => void;
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
    }
  }

  readCurrentMenuConfig(): GameConfig {
    const playerCountInputValue = parseInt((document.getElementById('playerCount') as HTMLInputElement)?.value ?? '1', 10);
    const botCountInputValue = parseInt((document.getElementById('botCount') as HTMLInputElement)?.value ?? '0', 10);
    const player1NameInputValue = (document.getElementById('player1Name') as HTMLInputElement)?.value || 'Игрок 1';
    const player2NameInputValue = (document.getElementById('player2Name') as HTMLInputElement)?.value || 'Игрок 2';
    const difficultyInputValue = parseInt((document.getElementById('difficulty') as HTMLInputElement)?.value ?? '1', 10);

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
}
