import './app/ui/styles.css';
import { Router } from './app/router';
import { renderMenu } from './app/ui/menuView';
import { renderHUD } from './app/ui/hudView';
import { renderResults } from './app/ui/resultView';
import { GameConfig, GameState } from './engine/types';
import { createGameState, initLevel, processTick } from './engine/game';
import { applyDirection } from './engine/systems/movementSystem';
import { renderGame, calculateCellSize } from './renderer/canvasRenderer';
import { InputHandler } from './app/inputHandler';
import { saveScore } from './storage/scoreStorage';
import { TICK_INTERVAL_MS } from './engine/constants';

const app = document.getElementById('app')!;
const router = new Router();
const inputHandler = new InputHandler();

let currentConfig: GameConfig | null = null;
let currentState: GameState | null = null;
let gameLoopId: number | null = null;
let timerIntervalId: number | null = null;

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

function showMenu(): void {
  inputHandler.stop();
  renderMenu(app, (config: GameConfig) => {
    currentConfig = config;
    router.navigate('game', config);
  });
}

function startGame(config: GameConfig): void {
  currentConfig = config;
  const level = 1;
  currentState = createGameState(config, level);
  initLevel(currentState, config);

  // Build game UI
  app.innerHTML = '';

  const hudContainer = document.createElement('div');
  hudContainer.id = 'hud';
  app.appendChild(hudContainer);

  const canvas = document.createElement('canvas');
  canvas.id = 'gameCanvas';
  app.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  // Size canvas
  resizeCanvas(canvas, currentState);

  inputHandler.start();
  renderHUD(hudContainer, currentState);

  // Start game loop
  startGameLoop(ctx, canvas, hudContainer);
}

function resizeCanvas(canvas: HTMLCanvasElement, state: GameState): void {
  const maxW = Math.min(window.innerWidth - 20, 900);
  const maxH = Math.min(window.innerHeight - 120, 700);
  const cellSize = calculateCellSize(state.width, state.height, maxW, maxH);

  canvas.width = state.width * cellSize;
  canvas.height = state.height * cellSize;

  // Store cellSize on canvas for later use
  (canvas as any).__cellSize = cellSize;
}

function startGameLoop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hudContainer: HTMLElement
): void {
  // Timer for level countdown (1 second intervals)
  timerIntervalId = window.setInterval(() => {
    if (currentState && !currentState.levelComplete && !currentState.gameOver) {
      currentState.levelTimeLeft = Math.max(0, currentState.levelTimeLeft - 1);
    }
  }, 1000);

  // Game tick loop
  gameLoopId = window.setInterval(() => {
    if (!currentState || !currentConfig) return;

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
    renderHUD(hudContainer, currentState);

    // Check game over / level complete
    if (currentState.levelComplete) {
      handleLevelComplete();
    }
  }, TICK_INTERVAL_MS);
}

function handleLevelComplete(): void {
  if (!currentState || !currentConfig) return;

  const aliveSnakes = currentState.snakes.filter(s => s.alive);
  const totalSnakes = currentState.snakes.length;

  if (totalSnakes === 1) {
    // Single player
    const snake = currentState.snakes[0];
    if (snake.alive) {
      // Won level — go to next level
      const nextLevel = currentState.level + 1;
      const newState = createGameState(currentConfig, nextLevel);

      // Carry over snake stats
      initLevel(newState, currentConfig);
      for (let i = 0; i < newState.snakes.length; i++) {
        newState.snakes[i].score = currentState.snakes[i]?.score || 0;
        newState.snakes[i].levelsWon = currentState.snakes[i]?.levelsWon || 0;
      }
      currentState = newState;

      // Re-render with new board
      const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
      if (canvas) {
        resizeCanvas(canvas, currentState);
      }
      return; // Continue the game loop
    } else {
      // Dead — game over
      finishGame();
    }
  } else {
    // Multiplayer — start next level or finish
    if (aliveSnakes.length >= 1) {
      const nextLevel = currentState.level + 1;
      const newState = createGameState(currentConfig, nextLevel);
      initLevel(newState, currentConfig);

      // Carry over stats
      for (let i = 0; i < newState.snakes.length; i++) {
        if (currentState.snakes[i]) {
          newState.snakes[i].score = currentState.snakes[i].score;
          newState.snakes[i].levelsWon = currentState.snakes[i].levelsWon;
        }
      }
      currentState = newState;

      const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
      if (canvas) {
        resizeCanvas(canvas, currentState);
      }
      return;
    } else {
      finishGame();
    }
  }
}

function finishGame(): void {
  if (!currentState) return;

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
