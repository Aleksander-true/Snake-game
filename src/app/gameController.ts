/**
 * GameController — single use-case orchestrator.
 *
 * Owns: GameState, EngineContext, FSM, InputHandler.
 * Manages: game loop (setInterval), timer, event handling, modal display.
 * Does NOT own: DOM structure (built externally and passed in).
 */
import { GameState, GameConfig } from '../engine/types';
import { EngineContext } from '../engine/context';
import { GameSettings } from '../engine/settings';
import { GameEngine } from '../engine/GameEngine';
import { TickResult } from '../engine/events';
import { renderGame, calculateCellSize } from '../renderer/canvasRenderer';
import { InputHandler } from './inputHandler';
import { GameFSM, GameFSMEvent } from './gameFSM';
import {
  showPauseModal,
  hideModal,
} from './ui/modal';
import { GameLoopScheduler } from './services/GameLoopScheduler';
import { HudPresenter } from './services/HudPresenter';
import { LevelCompletionService } from './services/LevelCompletionService';
import { InputApplicationService } from './services/InputApplicationService';
import { SessionProgressionService } from './services/SessionProgressionService';
import { ScorePersistenceService } from './services/ScorePersistenceService';

export interface GameControllerCallbacks {
  /** Called when controller wants to show the results screen. */
  onShowResults: (state: GameState) => void;
  /** Called when controller wants to go back to menu. */
  onGoToMenu: () => void;
}

export class GameController {
  private state: GameState | null = null;
  private config: GameConfig | null = null;
  private ctx: EngineContext;
  private gameEngine: GameEngine;
  private fsm: GameFSM;
  private inputHandler: InputHandler;
  private callbacks: GameControllerCallbacks;
  private devModeActive: boolean;
  private loopScheduler = new GameLoopScheduler();
  private hudPresenter = new HudPresenter();
  private levelCompletionService = new LevelCompletionService();
  private inputApplicationService = new InputApplicationService();
  private sessionProgressionService = new SessionProgressionService();
  private scorePersistenceService = new ScorePersistenceService();

  private canvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;

  constructor(
    ctx: EngineContext,
    inputHandler: InputHandler,
    callbacks: GameControllerCallbacks,
    devModeActive: boolean = false
  ) {
    this.ctx = ctx;
    this.gameEngine = new GameEngine(ctx);
    this.fsm = new GameFSM();
    this.inputHandler = inputHandler;
    this.callbacks = callbacks;
    this.devModeActive = devModeActive;
  }

  /* ======================== Public API ======================== */

  getFSM(): GameFSM { return this.fsm; }
  getState(): GameState | null { return this.state; }
  getConfig(): GameConfig | null { return this.config; }
  getSettings(): GameSettings { return this.ctx.settings; }
  isDevMode(): boolean { return this.devModeActive; }

  /**
   * Start a new game with the given config and optional level override.
   * Expects the DOM to be built externally; just needs the canvas element.
   */
  startGame(config: GameConfig, canvas: HTMLCanvasElement, overrideLevel?: number): void {
    this.config = config;
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext('2d')!;

    const level = overrideLevel ?? 1;
    this.state = this.gameEngine.createGameState(config, level);
    this.gameEngine.initLevel(this.state, config);

    this.resizeCanvas();

    // Wire input
    this.inputHandler.start();
    this.inputHandler.onPause(() => this.handleSpaceKey());

    this.fsm.reset('Playing');
    this.updateHUD();
    this.renderFrame();
    this.startGameLoop();
  }

  /** Stop and cleanup everything. */
  stop(): void {
    this.stopGameLoop();
    this.inputHandler.stop();
  }

  /** Handle Space key press — context-dependent via FSM. */
  handleSpaceKey(): void {
    const event = this.fsm.handleSpace();
    if (!event) return;
    this.handleFSMEvent(event);
  }

  /** Restart the game at a specific level (for dev panel). */
  restartAtLevel(level: number): void {
    if (!this.config || !this.canvas) return;
    this.stopGameLoop();
    hideModal();
    this.startGame(this.config, this.canvas, level);
  }

  /* ======================== FSM Event Handling ======================== */

  private handleFSMEvent(event: GameFSMEvent): void {
    const newState = this.fsm.send(event);
    if (!newState) return;

    switch (newState) {
      case 'Playing':
        this.onEnterPlaying(event);
        break;
      case 'Paused':
        this.onEnterPaused();
        break;
      case 'LevelComplete':
        // handled by handleLevelComplete
        break;
      case 'GameOver':
        // handled by handleLevelComplete
        break;
      case 'Results':
        this.onEnterResults();
        break;
      case 'Menu':
        this.callbacks.onGoToMenu();
        break;
    }
  }

  private onEnterPlaying(event: GameFSMEvent): void {
    hideModal();
    if (event === 'RESUME') {
      // Resume from pause — restart game loop
      this.updateHUD();
      this.startGameLoop();
    } else if (event === 'CONTINUE') {
      // Continue after level end — advance to next level
      this.advanceToNextLevel();
    } else if (event === 'RESTART') {
      // Restart from results
      if (this.config && this.canvas) {
        this.startGame(this.config, this.canvas);
      }
    }
  }

  private onEnterPaused(): void {
    this.stopGameLoop();
    this.updateHUD();
    showPauseModal(() => this.handleFSMEvent('RESUME'));
  }

  private onEnterResults(): void {
    this.stopGameLoop();
    hideModal();
    if (this.state) {
      this.scorePersistenceService.saveSessionScores(this.state);
      this.callbacks.onShowResults(this.state);
    }
  }

  /* ======================== Game Loop ======================== */

  private startGameLoop(): void {
    this.loopScheduler.start(this.ctx.settings.tickIntervalMs, {
      onSecondElapsed: () => {
        if (this.state && this.fsm.isPlaying()) {
          this.state.levelTimeLeft = Math.max(0, this.state.levelTimeLeft - 1);
          this.updateHUD();
        }
      },
      onTick: () => {
        if (!this.state || !this.config) return;
        if (!this.fsm.isPlaying()) return;
        this.executeTick();
      },
    });
  }

  private stopGameLoop(): void {
    this.loopScheduler.stop();
  }

  /* ======================== Tick ======================== */

  private executeTick(): void {
    if (!this.state || !this.config) return;

    // 1. Consume input buffer and apply all direction commands
    const inputSnapshot = this.inputHandler.consumeAll();
    this.inputApplicationService.applyTickCommands(this.state, this.config, this.ctx.settings, inputSnapshot);

    // 2. Process tick (engine — returns domain events)
    const result: TickResult = this.gameEngine.processTick(this.state);

    // 3. Render
    this.renderFrame();
    this.updateHUD();

    // 4. Handle domain events
    this.handleDomainEvents(result);
  }

  /* ======================== Domain Events ======================== */

  private handleDomainEvents(result: TickResult): void {
    for (const event of result.events) {
      switch (event.type) {
        case 'LEVEL_COMPLETED':
          this.handleLevelComplete();
          return; // stop processing further events this tick
        case 'GAME_OVER':
          // GAME_OVER is always preceded/followed by LEVEL_COMPLETED
          // in the same tick, so handled there
          break;
        // Other events (SNAKE_DIED, RABBIT_EATEN, RABBIT_BORN) can be
        // used for sounds/animations in the future
      }
    }
  }

  private handleLevelComplete(): void {
    if (!this.state || !this.config) return;

    // Stop the game loop while modal is shown
    this.stopGameLoop();
    this.levelCompletionService.handleCompletion(this.state, this.devModeActive, this.ctx.settings, {
      setState: (fsmState) => this.fsm.reset(fsmState),
      onContinue: () => this.handleFSMEvent('CONTINUE'),
      onShowResults: () => this.handleFSMEvent('SHOW_RESULTS'),
      onRestartSameLevel: (level) => {
        if (this.config && this.canvas) {
          this.startGame(this.config, this.canvas, level);
        }
      },
    });
  }

  /* ======================== Level Transitions ======================== */

  private advanceToNextLevel(): void {
    if (!this.state || !this.config || !this.canvas) return;

    this.state = this.sessionProgressionService.advanceToNextLevel(this.state, this.config, this.gameEngine);

    this.resizeCanvas();
    this.updateHUD();
    this.renderFrame();
    this.startGameLoop();
  }

  /* ======================== Rendering ======================== */

  private renderFrame(): void {
    if (!this.state || !this.canvasCtx || !this.canvas) return;
    const cellSize = (this.canvas as any).__cellSize || 10;
    renderGame(this.canvasCtx, this.state, cellSize, this.ctx.settings);
  }

  private updateHUD(): void {
    if (!this.state) return;
    const paused = this.fsm.getState() === 'Paused';
    this.hudPresenter.render(this.state, paused, this.ctx.settings);
  }

  private resizeCanvas(): void {
    if (!this.state || !this.canvas) return;
    const devPanelWidth = this.devModeActive ? 300 : 0;
    const sidePanelsWidth = 140 * 2 + 32;
    const maxW = Math.min(window.innerWidth - sidePanelsWidth - devPanelWidth - 40, 900);
    const maxH = Math.min(window.innerHeight - 120, 700);
    const cellSize = calculateCellSize(this.state.width, this.state.height, maxW, maxH);

    this.canvas.width = this.state.width * cellSize;
    this.canvas.height = this.state.height * cellSize;
    (this.canvas as any).__cellSize = cellSize;
  }
}
