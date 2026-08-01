export interface GameLayoutElements {
  canvas: HTMLCanvasElement;
  gameArea: HTMLElement;
  devPanelContainer: HTMLElement | null;
}

/**
 * Builds the game screen DOM structure.
 * Keeps all UI creation logic inside the ui layer.
 */
export class GameLayoutBuilder {
  constructor(private readonly appRoot: HTMLElement) {}

  build(devModeEnabled: boolean): GameLayoutElements {
    this.appRoot.innerHTML = '';

    const gameOuter = document.createElement('div');
    gameOuter.className = 'game-outer';

    const gameArea = this.createGameArea(devModeEnabled);
    let devPanelContainer: HTMLElement | null = null;

    if (devModeEnabled) {
      const layoutRow = document.createElement('div');
      layoutRow.className = 'game-layout-row';
      layoutRow.appendChild(gameArea);

      devPanelContainer = document.createElement('div');
      devPanelContainer.id = 'dev-panel-container';
      layoutRow.appendChild(devPanelContainer);

      gameOuter.appendChild(layoutRow);
    } else {
      gameOuter.appendChild(gameArea);
    }

    this.appRoot.appendChild(gameOuter);

    const canvas = gameArea.querySelector('#gameCanvas') as HTMLCanvasElement;
    return { canvas, gameArea, devPanelContainer };
  }

  private createGameArea(devModeEnabled: boolean): HTMLElement {
    const gameArea = document.createElement('div');
    gameArea.id = 'game-area';
    gameArea.className = 'game-area';

    const topBar = document.createElement('div');
    topBar.id = 'hud-top';
    topBar.className = 'game-top-bar';
    gameArea.appendChild(topBar);

    const middleRow = document.createElement('div');
    middleRow.className = devModeEnabled ? 'game-middle game-middle--dev' : 'game-middle';

    const playersPanel = document.createElement('aside');
    playersPanel.className = 'game-players-panel';
    playersPanel.setAttribute('aria-label', 'Игроки');
    playersPanel.innerHTML = `
      <section class="game-player-section">
        <h2 class="game-hud-title">Игрок 1</h2>
        <div id="hud-left" class="game-hud-card"></div>
      </section>
      <section class="game-player-section">
        <h2 class="game-hud-title">Игрок 2</h2>
        <div id="hud-right" class="game-hud-card"></div>
      </section>
    `;
    middleRow.appendChild(playersPanel);

    const canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    middleRow.appendChild(canvas);

    const botsPanel = document.createElement('aside');
    botsPanel.className = 'game-bots-panel';
    botsPanel.setAttribute('aria-label', 'Боты');
    botsPanel.innerHTML = `
      <h2 class="game-hud-title">Боты</h2>
      <div id="hud-bottom" class="game-bot-list"></div>
    `;
    middleRow.appendChild(botsPanel);

    gameArea.appendChild(middleRow);

    const touchControls = document.createElement('div');
    touchControls.id = 'touch-controls-single';
    touchControls.className = 'touch-controls-single';
    touchControls.innerHTML = `
      <div class="touch-controls-group touch-controls-group--left">
        <button type="button" class="touch-btn" data-dir="left">←</button>
        <button type="button" class="touch-btn" data-dir="right">→</button>
      </div>
      <div class="touch-controls-group touch-controls-group--right">
        <button type="button" class="touch-btn" data-dir="up">↑</button>
        <button type="button" class="touch-btn" data-dir="down">↓</button>
      </div>
    `;
    gameArea.appendChild(touchControls);

    const touchControlsDuo = document.createElement('div');
    touchControlsDuo.id = 'touch-controls-duo';
    touchControlsDuo.className = 'touch-controls-duo';
    touchControlsDuo.innerHTML = `
      <div class="touch-player touch-player--left">
        <button type="button" class="touch-btn" data-player="0" data-dir="up">↑</button>
        <div class="touch-player-row">
          <button type="button" class="touch-btn" data-player="0" data-dir="left">←</button>
          <button type="button" class="touch-btn" data-player="0" data-dir="right">→</button>
        </div>
        <button type="button" class="touch-btn" data-player="0" data-dir="down">↓</button>
      </div>
      <div class="touch-player touch-player--right">
        <button type="button" class="touch-btn" data-player="1" data-dir="up">↑</button>
        <div class="touch-player-row">
          <button type="button" class="touch-btn" data-player="1" data-dir="left">←</button>
          <button type="button" class="touch-btn" data-player="1" data-dir="right">→</button>
        </div>
        <button type="button" class="touch-btn" data-player="1" data-dir="down">↓</button>
      </div>
    `;
    gameArea.appendChild(touchControlsDuo);

    return gameArea;
  }
}
