import { Router } from './router';
import { hideModal } from './ui/modal';
import { GameConfig, GameState, Snake } from '../engine/types';
import { gameSettings, resetSettings } from '../engine/settings';
import { InputHandler } from './inputHandler';
import { EngineContext } from '../engine/context';
import { mathRng } from './adapters/mathRandomAdapter';
import { loadSettingsFromStorage } from './adapters/storageAdapter';
import { GameController } from './gameController';
import { GameLayoutBuilder } from './ui/game-layout';
import { MenuScreenService } from './services/MenuScreenService';
import { ArenaLaunchConfig } from './services/MenuScreenService';
import { ResultsScreenService } from './services/ResultsScreenService';
import { DevPanelLoader } from './services/DevPanelLoader';
import { createArenaDemoController, ArenaDemoController, getHeuristicAlgorithmById, HeuristicAlgorithm } from '../heuristic';

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
  private arenaDemoController: ArenaDemoController | null = null;
  private globalKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(private readonly appRoot: HTMLElement) {
    this.gameLayoutBuilder = new GameLayoutBuilder(appRoot);
    this.menuScreenService = new MenuScreenService(appRoot);
    this.resultsScreenService = new ResultsScreenService(appRoot);
  }

  init(): void {
    this.bindGlobalKeyboardShortcuts();
    this.router.onScreenChange((screen, data) => this.handleScreenChange(screen, data));
    this.showMenu();
  }

  private bindGlobalKeyboardShortcuts(): void {
    if (this.globalKeydownHandler) return;
    this.globalKeydownHandler = (event: KeyboardEvent) => {
      // Escape on results screen always returns to main menu.
      if (event.code === 'Escape' && this.router.getCurrentScreen() === 'results') {
        event.preventDefault();
        this.router.navigate('menu');
      }
    };
    document.addEventListener('keydown', this.globalKeydownHandler);
  }

  private handleScreenChange(screen: 'menu' | 'game' | 'results', data?: unknown): void {
    this.gameController?.stop();
    this.arenaDemoController?.stop();
    this.arenaDemoController = null;
    hideModal();

    switch (screen) {
      case 'menu':
        this.showMenu();
        break;
      case 'game':
        this.startGameFromNavigation(data);
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
      onStartArena: (arenaConfig: ArenaLaunchConfig) => {
        resetSettings();
        loadSettingsFromStorage();
        this.devModeActive = true;
        this.router.navigate('game', { mode: 'arena', arenaConfig });
      },
    });
  }

  private startGameFromNavigation(data?: unknown): void {
    if (data && typeof data === 'object' && (data as any).mode === 'arena') {
      const arenaConfig = (data as { mode: 'arena'; arenaConfig: ArenaLaunchConfig }).arenaConfig;
      this.startArenaDemo(arenaConfig);
      return;
    }
    this.startGame(data as GameConfig);
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

  private startArenaDemo(arenaConfig: ArenaLaunchConfig): void {
    hideModal();
    this.inputHandler.stop();
    const layout = this.gameLayoutBuilder.build(true);
    const gameOuter = this.appRoot.querySelector('.game-outer');
    if (gameOuter) {
      gameOuter.classList.add('arena-demo-mode');
    }

    const participants = this.buildArenaParticipants(arenaConfig);

    this.arenaDemoController = createArenaDemoController({
      canvas: layout.canvas,
      participants,
      difficultyLevel: arenaConfig.difficultyLevel,
      speedMultiplier: arenaConfig.speedMultiplier,
      seed: arenaConfig.seed,
      fitToViewport: true,
      onTick: (state) => this.updateArenaLiveStats(state),
    });
    this.mountArenaControls(layout.devPanelContainer, arenaConfig);
    this.updateArenaLiveStats(this.arenaDemoController.getState());
    this.arenaDemoController.start();
  }

  private mountArenaControls(container: HTMLElement | null, arenaConfig: ArenaLaunchConfig): void {
    if (!container || !this.arenaDemoController) return;
    container.innerHTML = `
      <div class="dev-panel">
        <h2 class="dev-panel-title">Арена ИИ</h2>
        <div class="dev-section">
          <div class="dev-row">
            <span class="dev-row-label">Змеек</span>
            <input class="dev-input dev-input-num" value="${arenaConfig.snakeCount}" disabled>
          </div>
          <div class="dev-row">
            <span class="dev-row-label">Seed</span>
            <input class="dev-input dev-input-num" value="${arenaConfig.seed}" disabled>
          </div>
          <div class="dev-row">
            <span class="dev-row-label">Сложность</span>
            <input class="dev-input dev-input-num" value="${arenaConfig.difficultyLevel}" disabled>
          </div>
          <div class="dev-row">
            <label class="dev-row-label" for="arenaSpeedControl">Скорость</label>
            <select id="arenaSpeedControl" class="dev-input">
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
            </select>
          </div>
        </div>
        <div class="dev-section">
          <div class="dev-section-title">Live-статистика</div>
          <div id="arenaLiveStats"></div>
        </div>
        <div class="dev-buttons">
          <button id="arenaBackBtn" class="btn btn-secondary btn-small">Меню</button>
        </div>
      </div>
    `;
    const speedSelect = container.querySelector('#arenaSpeedControl') as HTMLSelectElement | null;
    const backButton = container.querySelector('#arenaBackBtn') as HTMLButtonElement | null;
    if (speedSelect) {
      speedSelect.value = String(arenaConfig.speedMultiplier);
      speedSelect.addEventListener('change', () => {
        const nextSpeed = parseInt(speedSelect.value, 10);
        if (nextSpeed === 1 || nextSpeed === 2 || nextSpeed === 4 || nextSpeed === 8) {
          this.arenaDemoController?.setSpeedMultiplier(nextSpeed);
        }
      });
    }
    if (backButton) {
      backButton.addEventListener('click', () => this.router.navigate('menu'));
    }
  }

  private updateArenaLiveStats(state: GameState): void {
    const container = this.appRoot.querySelector('#arenaLiveStats') as HTMLElement | null;
    if (!container) return;
    const rows = state.snakes.map((snake) => this.renderArenaSnakeStatRow(snake)).join('');
    container.innerHTML = rows;
  }

  private renderArenaSnakeStatRow(snake: Snake): string {
    const statusText = snake.alive ? 'Жива' : `Мертва${snake.deathReason ? `: ${snake.deathReason}` : ''}`;
    return `
      <div class="dev-row">
        <span class="dev-row-label">#${snake.id + 1} ${snake.name}</span>
        <span class="dev-row-label">Очки: ${snake.score}, Длина: ${snake.segments.length}</span>
        <span class="dev-row-label">${statusText}</span>
      </div>
    `;
  }

  private buildArenaParticipants(arenaConfig: ArenaLaunchConfig): Array<{ name: string; algorithm: HeuristicAlgorithm }> {
    const participants: Array<{ name: string; algorithm: HeuristicAlgorithm }> = [];
    for (let participantIndex = 0; participantIndex < arenaConfig.snakeCount; participantIndex++) {
      const algorithmId = arenaConfig.algorithmIds[participantIndex] ?? 'greedy-board-v1';
      participants.push({
        name: `Арена ${participantIndex + 1}`,
        algorithm: getHeuristicAlgorithmById(algorithmId),
      });
    }
    return participants;
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
