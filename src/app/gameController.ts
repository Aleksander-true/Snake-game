/**
 * GameController — single use-case orchestrator.
 *
 * Owns: GameState, EngineContext, FSM, InputHandler.
 * Manages: game loop (setInterval), timer, event handling, modal display.
 * Does NOT own: DOM structure (built externally and passed in).
 */
import { GameState, GameConfig, Direction } from '../engine/types';
import { EngineContext } from '../engine/context';
import { GameSettings } from '../engine/settings';
import { GameEngine } from '../engine/GameEngine';
import { TickResult } from '../engine/events';
import { renderGame, calculateCellSize } from '../renderer/canvasRenderer';
import { InputHandler } from './inputHandler';
import { GameFSM, GameFSMEvent } from './gameFSM';
import {
  showPauseModal,
  showConfirmModal,
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
  private touchCleanup: (() => void) | null = null;
  private exitConfirmActive = false;

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
    this.inputHandler.setPlayerCount(config.playerCount);
    this.inputHandler.start();
    this.inputHandler.onPause(() => this.handleSpaceKey());
    this.inputHandler.onEscape(() => this.handleEscapeKey());
    this.inputHandler.onConfirm(() => this.handleConfirmKey());
    this.setupTouchControls(config);

    this.fsm.reset('Playing');
    this.updateHUD();
    this.renderFrame();
    this.startGameLoop();
  }

  /** Stop and cleanup everything. */
  stop(): void {
    this.stopGameLoop();
    this.teardownTouchControls();
    this.inputHandler.stop();
  }

  /** Handle Space key press — context-dependent via FSM. */
  handleSpaceKey(): void {
    if (this.exitConfirmActive) return;
    const event = this.fsm.handleSpace();
    if (!event) return;
    this.handleFSMEvent(event);
  }

  handleEscapeKey(): void {
    if (this.exitConfirmActive) {
      this.cancelExitConfirmation();
      return;
    }

    const fsmState = this.fsm.getState();
    if (fsmState === 'Playing') {
      this.showExitConfirmationFromPlaying();
      return;
    }
    if (fsmState === 'Paused') {
      this.exitToMenu();
    }
  }

  handleConfirmKey(): void {
    if (!this.exitConfirmActive) return;
    this.confirmExitToMenu();
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
    this.exitConfirmActive = false;
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
    this.exitConfirmActive = false;
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
          if (this.state.snakes.length > 1) {
            this.state.levelTimeLeft = Math.max(0, this.state.levelTimeLeft - 1);
          }
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
        // Other events (SNAKE_DIED, FOOD_EATEN, FOOD_BORN) can be
        // used for sounds/animations in the future
      }
    }
  }

  private handleLevelComplete(): void {
    if (!this.state || !this.config) return;

    // Stop the game loop while modal is shown
    this.stopGameLoop();
    if (this.state.gameOver) {
      this.scorePersistenceService.saveSessionScores(this.state);
    }
    this.levelCompletionService.handleCompletion(this.state, this.devModeActive, this.ctx.settings, {
      setState: (fsmState) => this.fsm.reset(fsmState),
      onContinue: () => this.handleFSMEvent('CONTINUE'),
      onRestart: () => this.handleFSMEvent('RESTART'),
      onMenu: () => this.handleFSMEvent('GO_TO_MENU'),
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

  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  }

  private setupTouchControls(config: GameConfig): void {
    this.teardownTouchControls();
    const touchRootSingle = document.getElementById('touch-controls-single');
    const touchRootDuo = document.getElementById('touch-controls-duo');
    if (!touchRootSingle || !touchRootDuo) return;

    if (!this.isTouchDevice()) {
      touchRootSingle.classList.remove('touch-controls-single--visible');
      touchRootDuo.classList.remove('touch-controls-duo--visible');
      this.setTouchHudOrientation(false);
      return;
    }

    if (config.playerCount === 1) {
      this.setupSinglePlayerTouchControls(touchRootSingle);
      touchRootDuo.classList.remove('touch-controls-duo--visible');
      this.setTouchHudOrientation(false);
      return;
    }

    if (config.playerCount >= 2) {
      this.setupMultiPlayerTouchControls(touchRootDuo);
      touchRootSingle.classList.remove('touch-controls-single--visible');
      this.setTouchHudOrientation(true);
      return;
    }
  }

  private setupSinglePlayerTouchControls(touchRoot: HTMLElement): void {
    touchRoot.classList.add('touch-controls-single--visible');
    const disposeHandlers: Array<() => void> = [];
    const bind = (selector: string, direction: Direction) => {
      const button = touchRoot.querySelector(selector) as HTMLButtonElement | null;
      if (!button) return;
      const onPress = (event: Event) => {
        event.preventDefault();
        this.inputHandler.queueDirection(0, direction);
      };
      button.addEventListener('pointerdown', onPress);
      disposeHandlers.push(() => button.removeEventListener('pointerdown', onPress));
    };

    bind('[data-dir="left"]', 'left');
    bind('[data-dir="right"]', 'right');
    bind('[data-dir="up"]', 'up');
    bind('[data-dir="down"]', 'down');

    this.touchCleanup = () => {
      for (const dispose of disposeHandlers) dispose();
      touchRoot.classList.remove('touch-controls-single--visible');
    };
  }

  private setupMultiPlayerTouchControls(touchRoot: HTMLElement): void {
    touchRoot.classList.add('touch-controls-duo--visible');
    const disposeHandlers: Array<() => void> = [];
    const buttons = touchRoot.querySelectorAll('[data-player][data-dir]');

    buttons.forEach(buttonElement => {
      const button = buttonElement as HTMLButtonElement;
      const playerIndex = parseInt(button.dataset.player || '', 10);
      const localDirection = button.dataset.dir as Direction | undefined;
      if (!Number.isFinite(playerIndex) || !localDirection) return;

      const onPress = (event: Event) => {
        event.preventDefault();
        const worldDirection = this.mapLocalDirectionForSidePlayer(playerIndex, localDirection);
        this.inputHandler.queueDirection(playerIndex, worldDirection);
      };
      button.addEventListener('pointerdown', onPress);
      disposeHandlers.push(() => button.removeEventListener('pointerdown', onPress));
    });

    this.touchCleanup = () => {
      for (const dispose of disposeHandlers) dispose();
      touchRoot.classList.remove('touch-controls-duo--visible');
      this.setTouchHudOrientation(false);
    };
  }

  private mapLocalDirectionForSidePlayer(playerIndex: number, localDirection: Direction): Direction {
    // Player 1 is assumed to stand at the left side (looking to the right),
    // player 2 at the right side (looking to the left).
    if (playerIndex === 0) {
      const map: Record<Direction, Direction> = {
        up: 'right',
        down: 'left',
        left: 'up',
        right: 'down',
      };
      return map[localDirection];
    }
    const map: Record<Direction, Direction> = {
      up: 'left',
      down: 'right',
      left: 'down',
      right: 'up',
    };
    return map[localDirection];
  }

  private setTouchHudOrientation(enabled: boolean): void {
    const leftPanel = document.getElementById('hud-left');
    const rightPanel = document.getElementById('hud-right');
    if (!leftPanel || !rightPanel) return;
    leftPanel.classList.toggle('game-side-panel--touch-left', enabled);
    rightPanel.classList.toggle('game-side-panel--touch-right', enabled);
  }

  private teardownTouchControls(): void {
    if (this.touchCleanup) {
      this.touchCleanup();
      this.touchCleanup = null;
    }
    this.setTouchHudOrientation(false);
  }

  private showExitConfirmationFromPlaying(): void {
    // Escape during active game pauses the simulation and asks for exit confirmation.
    this.stopGameLoop();
    this.fsm.reset('Paused');
    this.updateHUD();
    this.exitConfirmActive = true;
    showConfirmModal(
      'Выйти в меню?',
      'Текущая игра будет остановлена. Продолжить?',
      () => this.confirmExitToMenu(),
      () => this.cancelExitConfirmation(),
      'Да',
      'Нет'
    );
  }

  private confirmExitToMenu(): void {
    this.exitConfirmActive = false;
    this.exitToMenu();
  }

  private cancelExitConfirmation(): void {
    this.exitConfirmActive = false;
    this.handleFSMEvent('RESUME');
  }

  private exitToMenu(): void {
    this.stopGameLoop();
    this.exitConfirmActive = false;
    hideModal();
    this.callbacks.onGoToMenu();
  }
}
