import './app/ui/styles.css';
import { Router } from './app/router';
import { renderMenu } from './app/ui/menuView';
import { renderHUD } from './app/ui/hudView';
import { renderResults } from './app/ui/resultView';
import {
  showPauseModal, showLevelCompleteModal, showGameOverModal,
  hideModal, isModalVisible,
} from './app/ui/modalOverlay';
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
let waitingLevelEnd = false;  // level ended, modal shown, waiting for user
let devModeActive = false;    // whether the settings panel is shown

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
  waitingLevelEnd = false;
  hideModal();
  const level = overrideLevel ?? 1;
  currentState = createGameState(config, level);

  // In dev mode, apply wall overrides if present
  if (devModeActive && (gameSettings as any)._wallClustersOverride != null) {
    // Patch the initLevel to use overrides — we do it via settings hooks in game.ts
  }

  initLevel(currentState, config);
  buildGameDOM();
}

/**
 * Build game DOM structure.
 *
 * Layout (dev mode OFF):
 *   #app > .game-outer > #game-area > [topBar, middle(left + canvas + right), bottom]
 *
 * Layout (dev mode ON):
 *   #app > .game-outer > .game-layout-row > [ #game-area | #dev-panel-container ]
 *
 * The modal overlay is appended INSIDE #game-area so it never covers the dev panel.
 */
function buildGameDOM(): void {
  if (!currentState) return;
  app.innerHTML = '';

  const outer = document.createElement('div');
  outer.className = 'game-outer';

  // Game area — wraps everything the overlay should cover
  const gameArea = document.createElement('div');
  gameArea.id = 'game-area';
  gameArea.className = 'game-area';

  // Top bar
  const topBar = document.createElement('div');
  topBar.id = 'hud-top';
  topBar.className = 'game-top-bar';
  gameArea.appendChild(topBar);

  // Middle row (side panels + canvas)
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

  gameArea.appendChild(middle);

  // Bottom panel (bots)
  const bottomPanel = document.createElement('div');
  bottomPanel.id = 'hud-bottom';
  bottomPanel.className = 'game-bottom-panel';
  gameArea.appendChild(bottomPanel);

  // Assemble: in dev mode use a row layout; otherwise game-area is the only child
  if (devModeActive) {
    const layoutRow = document.createElement('div');
    layoutRow.className = 'game-layout-row';
    layoutRow.appendChild(gameArea);

    const devContainer = document.createElement('div');
    devContainer.id = 'dev-panel-container';
    layoutRow.appendChild(devContainer);

    outer.appendChild(layoutRow);

    // Lazy-load devPanel module
    import('./app/ui/devPanel').then(({ renderDevPanel }) => {
      renderDevPanel(devContainer, currentState!.level, (newLevel: number) => {
        stopGameLoop();
        startGame(currentConfig!, newLevel);
      });
    });
  } else {
    outer.appendChild(gameArea);
  }

  app.appendChild(outer);

  // Size canvas
  const ctx = canvas.getContext('2d')!;
  resizeCanvas(canvas, currentState);

  // Setup input + space key handler
  inputHandler.start();
  inputHandler.onPause(() => handleSpaceKey());

  // Initial HUD render
  updateHUD();

  // Start game loop
  startGameLoop(ctx, canvas);
}

/**
 * Central handler for Space key.
 * Context-sensitive: resume from pause, continue from level-end, or pause.
 */
function handleSpaceKey(): void {
  if (waitingLevelEnd) {
    // Level-end modal is showing → continue
    continueAfterLevelEnd();
    return;
  }
  togglePause();
}

function togglePause(): void {
  if (paused) {
    // Resume
    paused = false;
    hideModal();
    updateHUD();
  } else {
    // Pause
    paused = true;
    updateHUD();
    showPauseModal(() => togglePause());
  }
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

  // Determine if the game can continue
  let canAdvance = false;
  if (totalSnakes === 1) {
    canAdvance = currentState.snakes[0].alive;
  } else {
    canAdvance = aliveSnakes.length >= 1;
  }

  // Stop the game loop while modal is shown
  stopGameLoop();
  waitingLevelEnd = true;

  if (canAdvance) {
    // Show level-end modal with "Continue" button
    showLevelCompleteModal(currentState, () => continueAfterLevelEnd());
  } else {
    // Game over — show game over modal
    if (devModeActive) {
      // Dev mode: just show level-end modal, no results screen
      showLevelCompleteModal(currentState, () => {
        hideModal();
        waitingLevelEnd = false;
      });
    } else {
      showGameOverModal(currentState, () => {
        hideModal();
        waitingLevelEnd = false;
        finishGame();
      });
    }
  }
}

/** Called when user presses Continue after level-end. */
function continueAfterLevelEnd(): void {
  if (!currentState || !currentConfig) return;

  hideModal();
  waitingLevelEnd = false;

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  // Check if game is actually over (no alive snakes)
  const aliveSnakes = currentState.snakes.filter(s => s.alive);
  if (aliveSnakes.length === 0) {
    finishGame();
    return;
  }

  // Advance to next level
  advanceToNextLevel(canvas);
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

  // Restart game loop
  const ctx = canvas.getContext('2d')!;
  updateHUD();
  startGameLoop(ctx, canvas);
}

function finishGame(): void {
  if (!currentState) return;

  stopGameLoop();

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
