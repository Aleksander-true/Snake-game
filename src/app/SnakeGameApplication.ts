import { Router } from './router';
import { hideModal } from './ui/modal';
import { GameConfig, GameState } from '../engine/types';
import { gameSettings, resetSettings } from '../engine/settings';
import { InputHandler } from './inputHandler';
import { EngineContext } from '../engine/context';
import { mathRng } from './adapters/mathRandomAdapter';
import { loadSettingsFromStorage } from './adapters/storageAdapter';
import { GameController } from './gameController';
import { GameLayoutBuilder } from './ui/game-layout';
import { MenuScreenService } from './services/MenuScreenService';
import { ResultsScreenService } from './services/ResultsScreenService';
import { DevPanelLoader } from './services/DevPanelLoader';

/**
 * Application-level orchestrator.
 * Keeps routing and screen transitions in one place.
 */
export class SnakeGameApplication {
  private readonly router = new Router();
  private readonly inputHandler = new InputHandler();
  private readonly gameLayoutBuilder: GameLayoutBuilder;
  private readonly menuScreenService: MenuScreenService;
  private readonly resultsScreenService: ResultsScreenService;
  private readonly devPanelLoader = new DevPanelLoader();
  private readonly engineContext: EngineContext = {
    settings: gameSettings,
    rng: mathRng,
  };

  private currentConfig: GameConfig | null = null;
  private devModeActive = false;
  private gameController: GameController | null = null;

  constructor(private readonly appRoot: HTMLElement) {
    this.gameLayoutBuilder = new GameLayoutBuilder(appRoot);
    this.menuScreenService = new MenuScreenService(appRoot);
    this.resultsScreenService = new ResultsScreenService(appRoot);
  }

  init(): void {
    this.router.onScreenChange((screen, data) => this.handleScreenChange(screen, data));
    this.showMenu();
  }

  private handleScreenChange(screen: 'menu' | 'game' | 'results', data?: unknown): void {
    this.gameController?.stop();
    hideModal();

    switch (screen) {
      case 'menu':
        this.showMenu();
        break;
      case 'game':
        this.startGame(data as GameConfig);
        break;
      case 'results':
        this.showResults();
        break;
    }
  }

  private showMenu(): void {
    this.inputHandler.stop();
    this.devModeActive = false;

    this.menuScreenService.show({
      onStart: (config: GameConfig) => {
        // In normal mode we always use spec defaults (without persisted dev overrides).
        resetSettings();
        this.currentConfig = config;
        this.router.navigate('game', config);
      },
      onStartDevMode: () => {
        // Dev mode restores persisted tuning from localStorage.
        resetSettings();
        loadSettingsFromStorage();
        this.devModeActive = true;
        if (!this.currentConfig) {
          this.currentConfig = this.menuScreenService.readCurrentMenuConfig();
        }
        this.router.navigate('game', this.currentConfig);
      },
    });
  }

  private startGame(config: GameConfig, overrideLevel?: number): void {
    this.currentConfig = config;
    hideModal();

    const layout = this.gameLayoutBuilder.build(this.devModeActive);
    this.gameController = new GameController(
      this.engineContext,
      this.inputHandler,
      {
        onShowResults: (_state: GameState) => this.router.navigate('results'),
        onGoToMenu: () => this.router.navigate('menu'),
      },
      this.devModeActive
    );

    this.gameController.startGame(config, layout.canvas, overrideLevel);

    if (this.devModeActive && layout.devPanelContainer) {
      this.devPanelLoader.mount(
        layout.devPanelContainer,
        overrideLevel ?? 1,
        {
          difficultyLevel: config.difficultyLevel,
          snakeCount: config.playerCount + config.botCount,
        },
        (newLevel: number) => {
          this.gameController?.restartAtLevel(newLevel);
        }
      );
    }
  }

  private showResults(): void {
    const state = this.gameController?.getState();
    if (!state) return;

    this.inputHandler.stop();
    this.resultsScreenService.show(state, {
      onRestart: () => {
        if (this.currentConfig) {
          this.router.navigate('game', this.currentConfig);
        }
      },
      onMenu: () => this.router.navigate('menu'),
    });
  }
}
