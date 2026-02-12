import './app/ui/styles.css';
import { Router } from './app/router';
import { renderMenu } from './app/ui/menuView';
import { renderHUD } from './app/ui/hudView';
import { renderResults } from './app/ui/resultView';
import { GameConfig, GameState } from './engine/types';
import { createGameState, initLevel, processTick, getWallClusterCount, getWallLength } from './engine/game';
import { applyDirection } from './engine/systems/movementSystem';
import { renderGame, calculateCellSize } from './renderer/canvasRenderer';
import { InputHandler } from './app/inputHandler';
import { saveScore } from './storage/scoreStorage';
import { gameSettings } from './engine/settings';

const app = document.getElementById('app')!;
const router = new Router();
const inputHandler = new InputHandler();

let currentConfig: GameConfig | null = null;
let currentState: GameState | null = null;
let gameLoopId: number | null = null;
let timerIntervalId: number | null = null;
let paused = false;
let devModeActive = false;  // whether the settings panel is shown

function init(): void {
  router.onScreenChange((screen, data) => {
    stopGameLoop();
    switch (screen) {
      case 'menu':
        showMenu();
        break;
      case 'game':
        startGame(data as GameConfig);
        break;
      case 'results':
        showResults();
        break;
    }
  });

  showMenu();
}

/* ======================== Menu ======================== */

function showMenu(): void {
  inputHandler.stop();
  devModeActive = false;

  renderMenu(app, (config: GameConfig) => {
    currentConfig = config;
    router.navigate('game', config);
  });

  // In dev mode builds, add a "Режим настройки" button
  if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
    const panel = app.querySelector('.menu-panel');
    if (panel && !app.querySelector('#devModeBtn')) {
      const row = document.createElement('div');
      row.className = 'menu-dev-row';
      row.innerHTML = `<button id="devModeBtn" class="btn btn-dev">🛠 Режим настройки</button>`;
      panel.appendChild(row);

      row.querySelector('#devModeBtn')!.addEventListener('click', () => {
        devModeActive = true;
        if (!currentConfig) {
          // Read current menu values
          currentConfig = readMenuConfig();
        }
        router.navigate('game', currentConfig);
      });
    }
  }
}

/** Read config from current menu inputs (fallback). */
function readMenuConfig(): GameConfig {
  const pc = parseInt((document.getElementById('playerCount') as HTMLInputElement)?.value ?? '1', 10);
  const bc = parseInt((document.getElementById('botCount') as HTMLInputElement)?.value ?? '0', 10);
  const n1 = (document.getElementById('player1Name') as HTMLInputElement)?.value || 'Игрок 1';
  const n2 = (document.getElementById('player2Name') as HTMLInputElement)?.value || 'Игрок 2';
  const diff = parseInt((document.getElementById('difficulty') as HTMLInputElement)?.value ?? '1', 10);
  return {
    playerCount: Math.max(0, Math.min(2, pc)),
    botCount: Math.max(0, Math.min(4, bc)),
    playerNames: [n1, n2],
    difficultyLevel: Math.max(1, Math.min(10, diff)),
  };
}

/* ======================== Game ======================== */

function startGame(config: GameConfig, overrideLevel?: number): void {
  currentConfig = config;
  paused = false;
  const level = overrideLevel ?? 1;
  currentState = createGameState(config, level);

  // In dev mode, apply wall overrides if present
  if (devModeActive && (gameSettings as any)._wallClustersOverride != null) {
    // Patch the initLevel to use overrides — we do it via settings hooks in game.ts
  }

  initLevel(currentState, config);
  buildGameDOM();
}

/** Build game DOM structure: topBar + middle(left + canvas + right + devPanel?) + bottom. */
function buildGameDOM(): void {
  if (!currentState) return;
  app.innerHTML = '';

  const outer = document.createElement('div');
  outer.className = 'game-outer';

  // Top bar
  const topBar = document.createElement('div');
  topBar.id = 'hud-top';
  topBar.className = 'game-top-bar';
  outer.appendChild(topBar);

  // Middle row
  const middle = document.createElement('div');
  middle.className = devModeActive ? 'game-middle game-middle--dev' : 'game-middle';

  // Left panel (player 1)
  const leftPanel = document.createElement('div');
  leftPanel.id = 'hud-left';
  leftPanel.className = 'game-side-panel';
  middle.appendChild(leftPanel);

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'gameCanvas';
  middle.appendChild(canvas);

  // Right panel (player 2)
  const rightPanel = document.createElement('div');
  rightPanel.id = 'hud-right';
  rightPanel.className = 'game-side-panel';
  middle.appendChild(rightPanel);

  // Dev panel (only in dev mode when active)
  if (devModeActive) {
    const devContainer = document.createElement('div');
    devContainer.id = 'dev-panel-container';
    middle.appendChild(devContainer);

    // Lazy-load devPanel module
    import('./app/ui/devPanel').then(({ renderDevPanel }) => {
      renderDevPanel(devContainer, currentState!.level, (newLevel: number) => {
        // Apply pressed → restart on chosen level
        stopGameLoop();
        startGame(currentConfig!, newLevel);
      });
    });
  }

  outer.appendChild(middle);

  // Bottom panel (bots)
  const bottomPanel = document.createElement('div');
  bottomPanel.id = 'hud-bottom';
  bottomPanel.className = 'game-bottom-panel';
  outer.appendChild(bottomPanel);

  app.appendChild(outer);

  // Size canvas
  const ctx = canvas.getContext('2d')!;
  resizeCanvas(canvas, currentState);

  // Setup input + pause
  inputHandler.start();
  inputHandler.onPause(() => togglePause());

  // Initial HUD render
  updateHUD();

  // Start game loop
  startGameLoop(ctx, canvas);
}

function togglePause(): void {
  paused = !paused;
  updateHUD();
}

function updateHUD(): void {
  if (!currentState) return;
  const topBar = document.getElementById('hud-top');
  const left = document.getElementById('hud-left');
  const right = document.getElementById('hud-right');
  const bottom = document.getElementById('hud-bottom');
  if (topBar) {
    renderHUD(topBar, left, right, bottom, currentState, paused);
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, state: GameState): void {
  const devPanelWidth = devModeActive ? 300 : 0;
  const sidePanelsWidth = 140 * 2 + 32; // two side panels + gaps
  const maxW = Math.min(window.innerWidth - sidePanelsWidth - devPanelWidth - 40, 900);
  const maxH = Math.min(window.innerHeight - 120, 700);
  const cellSize = calculateCellSize(state.width, state.height, maxW, maxH);

  canvas.width = state.width * cellSize;
  canvas.height = state.height * cellSize;

  (canvas as any).__cellSize = cellSize;
}

/* ======================== Game Loop ======================== */

function startGameLoop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): void {
  // Timer for level countdown (1 second intervals)
  timerIntervalId = window.setInterval(() => {
    if (currentState && !currentState.levelComplete && !currentState.gameOver && !paused) {
      currentState.levelTimeLeft = Math.max(0, currentState.levelTimeLeft - 1);
      updateHUD();
    }
  }, 1000);

  // Game tick loop
  gameLoopId = window.setInterval(() => {
    if (!currentState || !currentConfig) return;
    if (paused) return;

    // Gather input for human players
    for (let i = 0; i < currentConfig.playerCount; i++) {
      const dir = inputHandler.consumeDirection(i);
      if (dir && currentState.snakes[i] && currentState.snakes[i].alive) {
        applyDirection(currentState.snakes[i], dir);
      }
    }

    // Process tick
    processTick(currentState);

    // Render
    const cellSize = (canvas as any).__cellSize || 10;
    renderGame(ctx, currentState, cellSize);
    updateHUD();

    // Check game over / level complete
    if (currentState.levelComplete) {
      handleLevelComplete(canvas);
    }
  }, gameSettings.tickIntervalMs);
}

function handleLevelComplete(canvas: HTMLCanvasElement): void {
  if (!currentState || !currentConfig) return;

  const aliveSnakes = currentState.snakes.filter(s => s.alive);
  const totalSnakes = currentState.snakes.length;

  if (totalSnakes === 1) {
    // Single player
    const snake = currentState.snakes[0];
    if (snake.alive) {
      advanceToNextLevel(canvas);
      return;
    } else {
      finishGame();
    }
  } else {
    // Multiplayer
    if (aliveSnakes.length >= 1) {
      advanceToNextLevel(canvas);
      return;
    } else {
      finishGame();
    }
  }
}

function advanceToNextLevel(canvas: HTMLCanvasElement): void {
  if (!currentState || !currentConfig) return;

  const nextLevel = currentState.level + 1;
  const oldSnakes = currentState.snakes;
  currentState = createGameState(currentConfig, nextLevel);
  initLevel(currentState, currentConfig);

  // Carry over stats
  for (let i = 0; i < currentState.snakes.length; i++) {
    if (oldSnakes[i]) {
      currentState.snakes[i].score = oldSnakes[i].score;
      currentState.snakes[i].levelsWon = oldSnakes[i].levelsWon;
    }
  }

  resizeCanvas(canvas, currentState);
}

function finishGame(): void {
  if (!currentState) return;

  // In dev mode with settings panel: skip results, just stop
  if (devModeActive) {
    stopGameLoop();
    // Show "game over" inline — just update HUD, don't navigate
    updateHUD();
    return;
  }

  // Save scores to localStorage
  for (const snake of currentState.snakes) {
    saveScore({
      playerName: snake.name,
      score: snake.score,
      levelsWon: snake.levelsWon,
      date: new Date().toLocaleDateString('ru-RU'),
      isBot: snake.isBot,
    });
  }

  stopGameLoop();
  router.navigate('results');
}

/* ======================== Results ======================== */

function showResults(): void {
  if (!currentState) return;
  inputHandler.stop();
  renderResults(
    app,
    currentState,
    () => {
      if (currentConfig) {
        router.navigate('game', currentConfig);
      }
    },
    () => {
      router.navigate('menu');
    }
  );
}

/* ======================== Helpers ======================== */

function stopGameLoop(): void {
  if (gameLoopId !== null) {
    clearInterval(gameLoopId);
    gameLoopId = null;
  }
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

init();
