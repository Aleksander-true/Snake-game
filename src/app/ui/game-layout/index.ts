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

    const leftPanel = document.createElement('div');
    leftPanel.id = 'hud-left';
    leftPanel.className = 'game-side-panel';
    middleRow.appendChild(leftPanel);

    const canvas = document.createElement('canvas');
    canvas.id = 'gameCanvas';
    middleRow.appendChild(canvas);

    const rightPanel = document.createElement('div');
    rightPanel.id = 'hud-right';
    rightPanel.className = 'game-side-panel';
    middleRow.appendChild(rightPanel);

    gameArea.appendChild(middleRow);

    const bottomPanel = document.createElement('div');
    bottomPanel.id = 'hud-bottom';
    bottomPanel.className = 'game-bottom-panel';
    gameArea.appendChild(bottomPanel);

    return gameArea;
  }
}
