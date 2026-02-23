import { applyDirection } from '../../engine/systems/movementSystem';
import { EngineContext } from '../../engine/context';
import { createDefaultSettings, GameSettings } from '../../engine/settings';
import { GameConfig, GameState } from '../../engine/types';
import { GameEngine } from '../../engine/GameEngine';
import { TickResult } from '../../engine/events';
import { renderGame } from '../../renderer/canvasRenderer';
import { HeuristicAlgorithm } from '../types';
import { greedyBoardHeuristic } from '../greedyBoardHeuristic';
import { ArenaParticipant } from './headlessArena';
import { createSeededRng } from './seededRng';

export interface ArenaDemoOptions {
  canvas: HTMLCanvasElement;
  participants: ArenaParticipant[];
  settings?: Partial<GameSettings>;
  level?: number;
  difficultyLevel?: number;
  speedMultiplier?: 1 | 2 | 4 | 8;
  seed?: number;
  fitToViewport?: boolean;
  onTick?: (state: GameState, result: TickResult) => void;
}

export interface ArenaDemoController {
  start: () => void;
  stop: () => void;
  setSpeedMultiplier: (multiplier: 1 | 2 | 4 | 8) => void;
  getSpeedMultiplier: () => 1 | 2 | 4 | 8;
  getState: () => GameState;
}

export function createArenaDemoController(options: ArenaDemoOptions): ArenaDemoController {
  const settings = createDefaultSettings();
  if (options.settings) {
    Object.assign(settings, options.settings);
  }
  // Arena demo is intended for endurance/comparison runs; avoid stopping by score target.
  settings.targetScoreCoeff = 0;
  settings.targetScoreBase = 1_000_000;

  const context: EngineContext = {
    settings,
    rng: createSeededRng(options.seed ?? 1),
  };
  const engine = new GameEngine(context);
  const config = createDemoConfig(options);
  const state = engine.createGameState(config, options.level ?? 1);
  engine.initLevel(state, config);
  applyArenaNames(state, options.participants);

  const canvas = options.canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available for arena demo');
  }
  const fitToViewport = options.fitToViewport ?? true;
  let cellSize = 2;
  const resizeCanvasToFit = (): void => {
    cellSize = fitToViewport ? getDemoCellSize(canvas, state) : Math.max(2, cellSize);
    canvas.width = state.width * cellSize;
    canvas.height = state.height * cellSize;
    renderGame(ctx, state, cellSize, settings);
  };
  resizeCanvasToFit();

  let speedMultiplier: 1 | 2 | 4 | 8 = options.speedMultiplier ?? 1;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let resizeBound = false;
  const onResize = (): void => {
    resizeCanvasToFit();
  };

  const step = (): void => {
    for (let stepIndex = 0; stepIndex < speedMultiplier; stepIndex++) {
      if (state.gameOver || state.levelComplete) break;
      applyArenaBotDirections(state, settings, options.participants);
      const tickResult = engine.processTick(state);
      if (options.onTick) options.onTick(state, tickResult);
    }
    renderGame(ctx, state, cellSize, settings);
    if (state.gameOver || state.levelComplete) {
      stop();
    }
  };

  const start = (): void => {
    if (timerId) return;
    if (!resizeBound && fitToViewport) {
      window.addEventListener('resize', onResize);
      resizeBound = true;
      resizeCanvasToFit();
    }
    const intervalMs = Math.max(1, Math.floor(settings.tickIntervalMs / speedMultiplier));
    timerId = setInterval(step, intervalMs);
  };

  const stop = (): void => {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
    if (resizeBound) {
      window.removeEventListener('resize', onResize);
      resizeBound = false;
    }
  };

  const setSpeed = (nextMultiplier: 1 | 2 | 4 | 8): void => {
    speedMultiplier = nextMultiplier;
    if (!timerId) return;
    stop();
    start();
  };

  renderGame(ctx, state, cellSize, settings);

  return {
    start,
    stop,
    setSpeedMultiplier: setSpeed,
    getSpeedMultiplier: () => speedMultiplier,
    getState: () => state,
  };
}

function createDemoConfig(options: ArenaDemoOptions): GameConfig {
  return {
    playerCount: 0,
    botCount: Math.max(1, options.participants.length),
    playerNames: [],
    difficultyLevel: options.difficultyLevel ?? 1,
    gameMode: 'classic',
  };
}

function applyArenaNames(state: GameState, participants: ArenaParticipant[]): void {
  for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
    const snake = state.snakes[participantIndex];
    if (!snake) continue;
    snake.name = participants[participantIndex].name;
  }
}

function applyArenaBotDirections(
  state: GameState,
  settings: GameSettings,
  participants: ArenaParticipant[]
): void {
  for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
    const snake = state.snakes[participantIndex];
    if (!snake || !snake.alive) continue;
    const algorithm: HeuristicAlgorithm = participants[participantIndex].algorithm ?? greedyBoardHeuristic;
    const direction = algorithm.chooseDirection(state, snake, settings);
    applyDirection(snake, direction);
  }
}

function getDemoCellSize(canvas: HTMLCanvasElement, state: GameState): number {
  const parentRect = canvas.parentElement?.getBoundingClientRect();
  const devPanelWidth = 420;
  const viewportWidth = Math.max(120, window.innerWidth - devPanelWidth);
  const viewportHeight = Math.max(120, window.innerHeight - 24);
  const parentWidth = Math.max(0, Math.floor(parentRect?.width ?? 0));
  const parentHeight = Math.max(0, Math.floor(parentRect?.height ?? 0));
  const sourceWidth = Math.max(parentWidth, viewportWidth);
  const sourceHeight = Math.max(parentHeight, viewportHeight);
  const safeWidth = Math.max(120, sourceWidth - 16);
  const safeHeight = Math.max(120, sourceHeight - 16);
  const byWidth = Math.floor(safeWidth / state.width);
  const byHeight = Math.floor(safeHeight / state.height);
  return Math.max(2, Math.min(byWidth, byHeight));
}

