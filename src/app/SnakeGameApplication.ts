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
import { ArenaLaunchConfig, TrainingLaunchConfig } from './services/MenuScreenService';
import { runArenaSimulation } from '../arena';
import type { ArenaRunResult } from '../arena';
import { ResultsScreenService } from './services/ResultsScreenService';
import { DevPanelLoader } from './services/DevPanelLoader';
import { createArenaDemoController, ArenaDemoController, getHeuristicAlgorithmById, HeuristicAlgorithm } from '../heuristic';
import { randomArenaAlgorithm } from '../ai/ai_algorithm';

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
      onStartTraining: (trainingConfig: TrainingLaunchConfig) => {
        resetSettings();
        loadSettingsFromStorage();
        this.devModeActive = true;
        this.router.navigate('game', { mode: 'training', trainingConfig });
      },
    });
  }

  private startGameFromNavigation(data?: unknown): void {
    if (data && typeof data === 'object' && (data as any).mode === 'arena') {
      const arenaConfig = (data as { mode: 'arena'; arenaConfig: ArenaLaunchConfig }).arenaConfig;
      this.startArenaDemo(arenaConfig);
      return;
    }
    if (data && typeof data === 'object' && (data as any).mode === 'training') {
      const trainingConfig = (data as { mode: 'training'; trainingConfig: TrainingLaunchConfig }).trainingConfig;
      this.startTrainingLab(trainingConfig);
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

  /**
   * Training lab: headless arena run with metrics in the side panel (no live game loop on canvas).
   * Step 0 uses randomArenaAlgorithm; later you can plug in a neural ArenaAlgorithm here.
   */
  private startTrainingLab(initialConfig: TrainingLaunchConfig): void {
    hideModal();
    this.inputHandler.stop();
    const layout = this.gameLayoutBuilder.build(true);
    const gameOuter = this.appRoot.querySelector('.game-outer');
    if (gameOuter) {
      gameOuter.classList.add('training-lab-mode');
    }

    this.mountTrainingLabPanel(layout.devPanelContainer, initialConfig);
  }

  private mountTrainingLabPanel(container: HTMLElement | null, initialConfig: TrainingLaunchConfig): void {
    if (!container) return;

    const readFormConfig = (): TrainingLaunchConfig => {
      const level = Math.max(
        1,
        Math.min(100, parseInt((container.querySelector('#trainingLabLevel') as HTMLInputElement).value || '1', 10))
      );
      const difficultyLevel = Math.max(
        1,
        Math.min(10, parseInt((container.querySelector('#trainingLabDifficulty') as HTMLInputElement).value || '1', 10))
      );
      const seed = Math.max(1, parseInt((container.querySelector('#trainingLabSeed') as HTMLInputElement).value || '1', 10));
      const maxTicks = Math.max(
        100,
        parseInt((container.querySelector('#trainingLabMaxTicks') as HTMLInputElement).value || '50000', 10)
      );
      const modeRaw = (container.querySelector('#trainingLabGameMode') as HTMLSelectElement).value;
      const gameMode = modeRaw === 'survival' ? 'survival' : 'classic';
      return { seed, level, difficultyLevel, maxTicks, gameMode };
    };

    container.innerHTML = `
      <div class="dev-panel training-lab-panel">
        <h2 class="dev-panel-title">Лаборатория обучения</h2>
        <div class="training-lab-about dev-section">
          <p class="training-lab-about-text">
            Экран для экспериментов с обучением: движок гоняет симуляцию без отрисовки каждого тика.
            Ниже — параметры прогона и числовой результат (фитнес). Полотно слева свободно: позже можно
            вывести график loss или подключить визуализацию.
          </p>
        </div>
        <div class="dev-section">
          <div class="dev-section-title">Параметры прогона</div>
          <div class="dev-row">
            <label class="dev-row-label" for="trainingLabLevel">Уровень</label>
            <input id="trainingLabLevel" class="dev-input dev-input-num" type="number" min="1" max="100" value="${initialConfig.level}">
          </div>
          <div class="dev-row">
            <label class="dev-row-label" for="trainingLabDifficulty">Сложность</label>
            <input id="trainingLabDifficulty" class="dev-input dev-input-num" type="number" min="1" max="10" value="${initialConfig.difficultyLevel}">
          </div>
          <div class="dev-row">
            <label class="dev-row-label" for="trainingLabGameMode">Режим</label>
            <select id="trainingLabGameMode" class="dev-input">
              <option value="classic" ${initialConfig.gameMode === 'classic' ? 'selected' : ''}>Классика</option>
              <option value="survival" ${initialConfig.gameMode === 'survival' ? 'selected' : ''}>Выживание</option>
            </select>
          </div>
          <div class="dev-row">
            <label class="dev-row-label" for="trainingLabSeed">Seed</label>
            <input id="trainingLabSeed" class="dev-input dev-input-num" type="number" min="1" step="1" value="${initialConfig.seed}">
          </div>
          <div class="dev-row">
            <label class="dev-row-label" for="trainingLabMaxTicks">Лимит тиков</label>
            <input id="trainingLabMaxTicks" class="dev-input dev-input-num" type="number" min="100" step="100" value="${initialConfig.maxTicks}">
          </div>
        </div>
        <div class="dev-section">
          <div class="dev-section-title">Политика</div>
          <p class="training-lab-policy-note">
            Сейчас: случайные повороты (<code class="training-lab-code">random-turns</code>) — одна змейка-бот.
            Дальше замените алгоритм на свою сеть, оставив тот же <code class="training-lab-code">runArenaSimulation</code>.
          </p>
        </div>
        <div class="dev-buttons training-lab-actions">
          <button id="trainingLabRunBtn" type="button" class="btn btn-primary btn-small">Запустить прогон</button>
          <button id="trainingLabMenuBtn" type="button" class="btn btn-secondary btn-small">Меню</button>
        </div>
        <div class="dev-section">
          <div class="dev-section-title">Результат последнего прогона</div>
          <pre id="trainingLabOutput" class="training-lab-output">Нажмите «Запустить прогон».</pre>
        </div>
      </div>
    `;

    const outputPre = container.querySelector('#trainingLabOutput') as HTMLElement;
    const runBtn = container.querySelector('#trainingLabRunBtn') as HTMLButtonElement;
    const menuBtn = container.querySelector('#trainingLabMenuBtn') as HTMLButtonElement;

    const run = (): void => {
      const config = readFormConfig();
      runBtn.disabled = true;
      outputPre.textContent = 'Считаю…';

      window.setTimeout(() => {
        try {
          const result = runArenaSimulation({
            participants: [{ name: 'Обучение', algorithm: randomArenaAlgorithm }],
            seed: config.seed,
            level: config.level,
            difficultyLevel: config.difficultyLevel,
            gameMode: config.gameMode,
            maxTicks: config.maxTicks,
          });
          outputPre.textContent = this.formatTrainingLabResult(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          outputPre.textContent = `Ошибка: ${message}`;
        } finally {
          runBtn.disabled = false;
        }
      }, 0);
    };

    runBtn.addEventListener('click', run);
    if (menuBtn) {
      menuBtn.addEventListener('click', () => this.router.navigate('menu'));
    }
  }

  private formatTrainingLabResult(result: ArenaRunResult): string {
    const lines: string[] = [
      `Seed: ${result.seed}`,
      `Выполнено тиков (симуляция): ${result.ticksExecuted}`,
      `Условное время: ${result.elapsedMs} мс (тик × интервал из настроек)`,
      `Уровень завершён: ${result.levelComplete ? 'да' : 'нет'}`,
      `Game over: ${result.gameOver ? 'да' : 'нет'}`,
      '',
    ];
    for (const s of result.snakes) {
      lines.push(
        `Змейка «${s.name}» (алгоритм: ${s.algorithmId})`,
        `  Очки: ${s.score}, длина жизни (тики): ${s.survivedTicks}, мс: ${s.survivedMs}`,
        `  Жива в конце: ${s.aliveAtEnd ? 'да' : 'нет'}`,
        s.deathReason ? `  Причина смерти: ${s.deathReason}` : '  Причина смерти: —',
        ''
      );
    }
    return lines.join('\n');
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
