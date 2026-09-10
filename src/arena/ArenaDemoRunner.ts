import {
  applyDirection,
  createDefaultSettings,
  createSeededRng,
  GameEngine,
} from '@snake-game/core';
import type {
  ArenaParticipant,
  EngineContext,
  GameConfig,
  GameSettings,
  GameState,
  RandomPort,
  TickResult,
} from '@snake-game/core';
import { renderGame } from '../renderer/canvasRenderer';

export type ArenaSpeedMultiplier = 1 | 2 | 4 | 8 | 16 | 32 | 100 | 1000;

export interface ArenaDemoOptions {
  canvas: HTMLCanvasElement;
  participants: ArenaParticipant[];
  settings?: Partial<GameSettings>;
  level?: number;
  difficultyLevel?: number;
  speedMultiplier?: ArenaSpeedMultiplier;
  seed?: number;
  fitToViewport?: boolean;
  onTick?: (state: GameState, result: TickResult) => void;
  onRender?: (state: GameState) => void;
  onComplete?: (state: GameState) => void;
}

export interface ArenaDemoController {
  start: () => void;
  stop: () => void;
  setSpeedMultiplier: (multiplier: ArenaSpeedMultiplier) => void;
  getSpeedMultiplier: () => ArenaSpeedMultiplier;
  getState: () => GameState;
}

/** Arena runner with canvas render and timer. For headless runOne + fitness use Arena class. */
export class ArenaDemoRunner implements ArenaDemoController {
  private readonly state: GameState;
  private readonly engine: GameEngine;
  private readonly settings: GameSettings;
  private readonly participants: ArenaParticipant[];
  private readonly canvas: HTMLCanvasElement;
  private readonly onTick?: (state: GameState, result: TickResult) => void;
  private readonly onRender?: (state: GameState) => void;
  private readonly onComplete?: (state: GameState) => void;
  private readonly algorithmRng: RandomPort;

  private ctx: CanvasRenderingContext2D;
  private cellSize = 2;
  private fitToViewport: boolean;
  private speedMultiplier: ArenaSpeedMultiplier;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private resizeBound = false;
  private completionNotified = false;

  constructor(options: ArenaDemoOptions) {
    const settings = createDefaultSettings();
    Object.assign(settings, {
      targetScoreCoeff: 0,
      targetScoreBase: 1_000_000,
    });
    if (options.settings) {
      Object.assign(settings, options.settings);
    }
    this.settings = settings;
    this.algorithmRng = createSeededRng((options.seed ?? 1) ^ 0x5f3759df);

    const context: EngineContext = {
      settings: this.settings,
      rng: createSeededRng(options.seed ?? 1),
    };
    this.engine = new GameEngine(context);
    const config = createDemoConfigFromOptions(options);
    this.state = this.engine.createGameState(config, options.level ?? 1);
    this.engine.initLevel(this.state, config);
    this.applyNames(options.participants);
    this.participants = options.participants;

    this.canvas = options.canvas;
    const context2d = this.canvas.getContext('2d');
    if (!context2d) {
      throw new Error('Canvas 2D context is not available for arena demo');
    }
    this.ctx = context2d;
    this.fitToViewport = options.fitToViewport ?? true;
    this.speedMultiplier = options.speedMultiplier ?? 1;
    this.onTick = options.onTick;
    this.onRender = options.onRender;
    this.onComplete = options.onComplete;

    this.resizeCanvasToFit();
    renderGame(this.ctx, this.state, this.cellSize, this.engine.getSettings());
  }

  start(): void {
    if (this.timerId) return;
    if (!this.resizeBound && this.fitToViewport) {
      window.addEventListener('resize', this.handleResize);
      this.resizeBound = true;
      this.resizeCanvasToFit();
    }
    const intervalMs = this.speedMultiplier <= 8
      ? Math.max(16, Math.floor(this.engine.getSettings().tickIntervalMs / this.speedMultiplier))
      : 50;
    this.timerId = setInterval(() => this.step(), intervalMs);
  }

  stop(): void {
    if (!this.timerId) return;
    clearInterval(this.timerId);
    this.timerId = null;
    if (this.resizeBound) {
      window.removeEventListener('resize', this.handleResize);
      this.resizeBound = false;
    }
  }

  setSpeedMultiplier(multiplier: ArenaSpeedMultiplier): void {
    this.speedMultiplier = multiplier;
    if (!this.timerId) return;
    this.stop();
    this.start();
  }

  getSpeedMultiplier(): ArenaSpeedMultiplier {
    return this.speedMultiplier;
  }

  getState(): GameState {
    return this.state;
  }

  private step(): void {
    const ticksPerFrame = this.speedMultiplier <= 8
      ? 1
      : Math.max(1, Math.round(this.speedMultiplier * 50 / this.engine.getSettings().tickIntervalMs));
    for (let i = 0; i < ticksPerFrame; i++) {
      if (this.state.gameOver || this.state.levelComplete) break;
      this.applyBotDirections();
      const tickResult = this.engine.processTick(this.state);
      if (this.onTick) this.onTick(this.state, tickResult);
    }
    renderGame(this.ctx, this.state, this.cellSize, this.engine.getSettings());
    this.onRender?.(this.state);
    if (this.state.gameOver || this.state.levelComplete) {
      this.stop();
      if (!this.completionNotified) {
        this.completionNotified = true;
        this.onComplete?.(this.state);
      }
    }
  }

  private handleResize = (): void => {
    this.resizeCanvasToFit();
  };

  private resizeCanvasToFit(): void {
    this.cellSize = this.fitToViewport
      ? this.getDemoCellSize()
      : Math.max(2, this.cellSize);
    this.canvas.width = this.state.width * this.cellSize;
    this.canvas.height = this.state.height * this.cellSize;
    renderGame(this.ctx, this.state, this.cellSize, this.engine.getSettings());
  }

  private getDemoCellSize(): number {
    const parentRect = this.canvas.parentElement?.getBoundingClientRect();
    const devPanelWidth = 420;
    const viewportWidth = Math.max(120, window.innerWidth - devPanelWidth);
    const viewportHeight = Math.max(120, window.innerHeight - 24);
    const parentWidth = Math.max(0, Math.floor(parentRect?.width ?? 0));
    const parentHeight = Math.max(0, Math.floor(parentRect?.height ?? 0));
    const sourceWidth = Math.max(parentWidth, viewportWidth);
    const sourceHeight = Math.max(parentHeight, viewportHeight);
    const safeWidth = Math.max(120, sourceWidth - 16);
    const safeHeight = Math.max(120, sourceHeight - 16);
    const byWidth = Math.floor(safeWidth / this.state.width);
    const byHeight = Math.floor(safeHeight / this.state.height);
    return Math.max(2, Math.min(byWidth, byHeight));
  }

  private applyNames(participants: ArenaParticipant[]): void {
    for (let i = 0; i < participants.length; i++) {
      const snake = this.state.snakes[i];
      if (snake) {
        snake.name = participants[i].name;
      }
    }
  }

  private applyBotDirections(): void {
    for (let i = 0; i < this.participants.length; i++) {
      const snake = this.state.snakes[i];
      if (!snake || !snake.alive) continue;
      const direction = this.participants[i].algorithm.chooseDirection(
        this.state,
        snake,
        this.engine.getSettings(),
        this.algorithmRng
      );
      applyDirection(snake, direction);
    }
  }

}

export function createArenaDemoController(
  options: ArenaDemoOptions
): ArenaDemoController {
  return new ArenaDemoRunner(options);
}

function createDemoConfigFromOptions(options: ArenaDemoOptions): GameConfig {
  return {
    playerCount: 0,
    botCount: Math.max(1, options.participants.length),
    playerNames: [],
    difficultyLevel: options.difficultyLevel ?? 1,
    gameMode: 'classic',
  };
}
