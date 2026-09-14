import {
  calculateObservationInputSize,
  createDefaultSettings,
  createDefaultGeneticTrainingConfig,
  createDenseNetworkFromGenome,
  createNeuralArenaAlgorithm,
  getHeuristicAlgorithmById,
} from '@snake-game/core';
import type {
  ArenaParticipant,
  GenerationReport,
  GameState,
  GeneticTrainingCheckpoint,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  NeuralNetworkTrace,
  TrainingCandidateResult,
  TrainingEvaluationMetrics,
  TrainingLabSettings,
  TrainedModelArtifact,
  TrainingCandidateGenome,
} from '@snake-game/core';
import { createArenaDemoController } from '../arena/ArenaDemoRunner';
import type { ArenaDemoController, ArenaSpeedMultiplier } from '../arena/ArenaDemoRunner';
import type { TrainingLaunchConfig } from '../app/services/MenuScreenService';
import { BrowserGeneticTrainingRunner } from './BrowserGeneticTrainingRunner';
import { LocalModelRepository, parseModelArtifact } from './LocalModelRepository';
import { IndexedDbTrainingCheckpointRepository } from './TrainingCheckpointRepository';
import { openTrainingGuide } from './TrainingGuideWindow';
import { TrainingWakeLock } from './TrainingWakeLock';
import { TrainingNetworkVisualizer } from './TrainingNetworkVisualizer';
import { resolveTrainingWorkerCount } from './trainingWorkerSelection';

export interface TrainingLabControllerOptions {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  outputHost: HTMLElement;
  previewPanel: HTMLElement;
  initialConfig: TrainingLaunchConfig;
  onBack: () => void;
}

interface ChampionPreview {
  id: string;
  generation: number | null;
  fitness: number;
  recordFitness: number;
  recordGeneration: number;
  recordValidationFitness?: number;
  genome: Float32Array;
  config: GeneticTrainingConfig;
  metrics: TrainingEvaluationMetrics;
  source: 'training' | 'saved';
  currentFoodEaten: number;
  cohortOpponent?: TrainingCandidateGenome;
  cohortOpponentName?: string;
}

type TrainingDisplayMode = 'visual' | 'background';
type TrainingReplayScenario = 'solo' | 'heuristic' | 'cohort';

export class TrainingLabController {
  private readonly runner = new BrowserGeneticTrainingRunner();
  private readonly repository = new LocalModelRepository();
  private readonly checkpointRepository = new IndexedDbTrainingCheckpointRepository();
  private readonly wakeLock: TrainingWakeLock;
  private reports: GenerationReport[] = [];
  private result: GeneticTrainingResult | null = null;
  private replay: ArenaDemoController | null = null;
  private activePreview: ChampionPreview | null = null;
  private queuedChampion: ChampionPreview | null = null;
  private previewRun = 0;
  private displayMode: TrainingDisplayMode = 'visual';
  private fineTuneModel: TrainedModelArtifact | null = null;
  private checkpointWrite: Promise<void> = Promise.resolve();
  private networkVisualizer: TrainingNetworkVisualizer | null = null;
  private replayScenarioSelect: HTMLSelectElement | null = null;
  private savedModels: TrainedModelArtifact[] = [];
  private activeLabSettings: TrainingLabSettings | null = null;

  constructor(private readonly options: TrainingLabControllerOptions) {
    this.wakeLock = new TrainingWakeLock((message) => this.setPowerStatus(message));
  }

  mount(): void {
    this.options.panel.innerHTML = trainingLabMarkup;
    this.mountNetworkVisualizer();
    this.options.outputHost.appendChild(this.element('trainingOutput'));
    this.writeInitialValues();
    this.bindActions();
    this.bindParameterHelp();
    this.applyDisplayMode();
    this.renderModels();
    this.renderCheckpoints();
  }

  stop(): void {
    this.runner.stop();
    this.replay?.stop();
    this.replay = null;
    this.activePreview = null;
    this.queuedChampion = null;
    this.networkVisualizer?.reset();
    this.wakeLock.stop();
  }

  private writeInitialValues(): void {
    const defaults = createDefaultGeneticTrainingConfig(
      calculateObservationInputSize(createDefaultSettings().visionSize),
    );
    this.setValue('trainingGenerations', defaults.generations);
    this.setValue('trainingPopulation', defaults.populationSize);
    this.setValue('trainingElite', defaults.eliteCount);
    this.setValue('trainingTournament', defaults.tournamentSize);
    this.setValue('trainingHiddenLayers', defaults.topology.slice(1, -1).join(','));
    this.setValue('trainingCrossover', defaults.crossoverRate);
    this.setValue('trainingMutationRate', defaults.mutationRate);
    this.setValue('trainingMutationSigma', defaults.mutationSigma);
    this.setValue('trainingValidationEvery', defaults.validationEvery);
    this.setValue('trainingSoloWeight', defaults.scenarioWeights.solo);
    this.setValue('trainingHeuristicWeight', defaults.scenarioWeights.heuristic);
    this.setValue('trainingCohortWeight', defaults.scenarioWeights.cohort);
    this.setValue('trainingLevel', this.options.initialConfig.level);
    this.setValue('trainingDifficulty', this.options.initialConfig.difficultyLevel);
    this.setValue('trainingSeed', this.options.initialConfig.seed);
    this.setValue('trainingMaxTicks', this.options.initialConfig.maxTicks);
    this.setValue('trainingGameMode', this.options.initialConfig.gameMode);
    this.setValue('trainingCheckpointEvery', 10);
    this.setValue('trainingWorkerCount', Math.max(1, (navigator.hardwareConcurrency || 2) - 2));
    this.writeFitnessValues(defaults);
  }

  private bindActions(): void {
    this.button('trainingStart').addEventListener('click', () => this.startTraining());
    this.button('trainingPause').addEventListener('click', () => this.pauseTraining());
    this.button('trainingAbort').addEventListener('click', () => this.abortTraining());
    this.button('trainingSave').addEventListener('click', () => this.saveCurrentModel());
    this.button('trainingDownload').addEventListener('click', () => {
      if (this.result) this.downloadModel(this.result.model);
    });
    this.button('trainingCsv').addEventListener('click', () => this.downloadCsv());
    this.button('trainingImport').addEventListener('click', () => this.fileInput().click());
    this.button('trainingGuide').addEventListener('click', () => {
      if (!openTrainingGuide()) this.setStatus('Браузер заблокировал окно инструкции');
    });
    this.fileInput().addEventListener('change', () => this.importSelectedModel());
    this.button('trainingMenu').addEventListener('click', this.options.onBack);
    this.select('trainingDisplayMode').addEventListener('change', () => this.applyDisplayMode());
    this.select('trainingWorkerSelection').addEventListener('change', () => this.applyWorkerSelection());
    this.input('trainingWorkerCount').addEventListener('input', () => this.applyWorkerSelection());
    [
      'trainingFitnessScore',
      'trainingFitnessApproach',
      'trainingFitnessWins',
      'trainingFitnessSurvival',
      'trainingFitnessAlive',
      'trainingFitnessDeath',
    ].forEach((id) => this.input(id).addEventListener('input', () => this.renderFitnessFormula()));
    this.select('trainingReplaySpeed').addEventListener('change', () => {
      const speed = Number(this.select('trainingReplaySpeed').value) as ArenaSpeedMultiplier;
      this.replay?.setSpeedMultiplier(speed);
    });
    this.replayScenarioSelect?.addEventListener('change', () => this.restartPreview());
    this.options.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')
      .forEach((control) => {
        const clearValidation = () => {
          control.setCustomValidity('');
          control.removeAttribute('aria-invalid');
        };
        control.addEventListener('input', clearValidation);
        control.addEventListener('change', clearValidation);
      });
    this.applyWorkerSelection();
  }

  private bindParameterHelp(): void {
    Object.entries(trainingParameterHelp).forEach(([controlId, description]) => {
      const control = this.element(controlId) as HTMLInputElement | HTMLSelectElement;
      const label = control.closest('label');
      if (!label) return;
      this.addParameterHelp(control, label, description);
    });
  }

  private addParameterHelp(
    control: HTMLInputElement | HTMLSelectElement,
    label: HTMLElement,
    description: string,
  ): void {
    const help = document.createElement('span');
    help.className = 'training-parameter-help';
    help.tabIndex = 0;
    help.textContent = '?';
    const tooltip = document.createElement('span');
    tooltip.id = `${control.id}Help`;
    tooltip.className = 'training-parameter-tooltip';
    tooltip.textContent = description;
    help.appendChild(tooltip);
    label.appendChild(help);
    control.setAttribute('aria-describedby', tooltip.id);
  }

  private startTraining(checkpoint?: GeneticTrainingCheckpoint): void {
    if (this.runner.isRunning()) return;
    try {
      const config = this.readConfig();
      const labSettings = this.readLabSettings();
      if (checkpoint) {
        Object.assign(config, checkpoint.config, {
          generations: Math.max(checkpoint.config.generations, checkpoint.nextGeneration),
          trainingSeedStrategy: checkpoint.config.trainingSeedStrategy ?? 'fixed',
        });
      }
      if (
        !checkpoint
        && this.fineTuneModel
        && this.fineTuneModel.topology.join(',') !== config.topology.join(',')
      ) {
        throw new Error('Для дообучения сохраните топологию нейросети исходной модели');
      }
      this.reports = checkpoint?.reports.map((report) => ({ ...report })) ?? [];
      this.result = null;
      this.replay?.stop();
      this.replay = null;
      this.activePreview = null;
      this.queuedChampion = null;
      this.networkVisualizer?.reset();
      this.previewRun = 0;
      this.clearReport();
      if (this.reports.length > 0) this.renderCondensedReport();
      this.displayMode = this.readDisplayMode();
      this.activeLabSettings = labSettings;
      this.applyDisplayMode();
      if (this.displayMode === 'background') {
        this.wakeLock.start();
      } else {
        this.wakeLock.stop();
      }
      this.setRunning(true);
      this.setStatus('Подготовка популяции…');
      const workerCount = resolveTrainingWorkerCount(
        labSettings.workerSelection,
        labSettings.workerCount,
      );
      this.runner.start(config, {
        onMessage: (message) => {
          if (message.type === 'progress') {
            const label = message.stage === 'preparing'
              ? 'Подготовка популяции'
              : message.stage === 'validating'
                ? 'Validation'
                : 'Оценка поколения';
            this.setStatus(
              `${label} ${message.generation}: ${message.completed}/${message.total}; Worker: ${message.workerCount}`,
            );
          } else if (message.type === 'generation') {
            this.reports.push(message.report);
            if (this.displayMode === 'background') {
              this.renderBackgroundProgress(message.report, config.generations);
            } else {
              this.renderGeneration(message.report, config.generations);
              this.queueChampionPreview(
                message.generationBest,
                message.report.generation,
                message.recordFitness,
                message.recordGeneration,
                message.recordValidationFitness,
                config,
                message.cohortOpponent,
              );
            }
            this.renderExecutionProgress(message.report, config.generations, message.workerCount);
          } else if (message.type === 'checkpoint') {
            this.queueCheckpointSave(message.checkpoint, this.withLabSettings(message.model));
          } else if (message.type === 'paused') {
            this.queueCheckpointSave(message.checkpoint, this.withLabSettings(message.model), true);
          } else if (message.type === 'completed') {
            void this.completeTraining(message.result, message.runId);
          } else {
            console.error('[training] Training failed', message.message);
            this.wakeLock.stop();
            this.setRunning(false);
            this.setStatus(`Ошибка: ${message.message}`);
          }
        },
      }, {
        execution: { workerCount, checkpointEvery: labSettings.checkpointEvery },
        checkpoint,
        initialModel: checkpoint ? undefined : this.fineTuneModel ?? undefined,
      });
    } catch (error) {
      console.error('[training] Could not start training', error);
      this.wakeLock.stop();
      this.setRunning(false);
      this.setStatus(`Ошибка конфигурации: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private pauseTraining(): void {
    if (!this.runner.isRunning()) return;
    this.runner.pause();
    this.button('trainingPause').disabled = true;
    this.setStatus('Пауза запрошена: завершается текущее поколение и сохраняется checkpoint…');
  }

  private abortTraining(): void {
    if (!this.runner.isRunning()) return;
    this.runner.stop();
    this.replay?.stop();
    this.replay = null;
    this.queuedChampion = null;
    this.wakeLock.stop();
    this.setPowerStatus('Wake Lock выключен: обучение отменено.');
    this.setRunning(false);
    this.setStatus('Обучение отменено без дополнительного сохранения. Ранее созданные checkpoint сохранены.');
  }

  private readConfig(): GeneticTrainingConfig {
    const inputSize = calculateObservationInputSize(createDefaultSettings().visionSize);
    const seed = this.integer('trainingSeed', 1, 2_000_000_000);
    const config = createDefaultGeneticTrainingConfig(inputSize, seed);
    const hiddenLayersInput = this.input('trainingHiddenLayers');
    const hiddenLayerParts = hiddenLayersInput.value.split(',').map((value) => value.trim());
    const hiddenLayers = hiddenLayerParts.map(Number);
    if (
      hiddenLayerParts.length === 0
      || hiddenLayerParts.length > 4
      || hiddenLayerParts.some((value) => value === '')
      || hiddenLayers.some((value) => !Number.isInteger(value) || value < 1 || value > 256)
    ) {
      this.rejectField(hiddenLayersInput, 'Скрытые слои: укажите от 1 до 4 целых чисел 1–256 через запятую');
    }
    config.populationSize = this.integer('trainingPopulation', 4, 256);
    config.generations = this.integer('trainingGenerations', 1);
    config.eliteCount = this.integer('trainingElite', 1, config.populationSize - 1);
    config.tournamentSize = this.integer('trainingTournament', 2, config.populationSize);
    config.crossoverRate = this.decimal('trainingCrossover', 0, 1);
    config.mutationRate = this.decimal('trainingMutationRate', 0, 1);
    config.mutationSigma = this.decimal('trainingMutationSigma', 0.0001, 10);
    config.topology = [inputSize, ...hiddenLayers, 3];
    config.validationEvery = this.integer('trainingValidationEvery', 1, config.generations);
    config.maxTicks = this.integer('trainingMaxTicks', 100, 100_000);
    config.level = this.integer('trainingLevel', 1, 100);
    config.difficultyLevel = this.integer('trainingDifficulty', 1, 10);
    config.gameMode = this.select('trainingGameMode').value === 'survival' ? 'survival' : 'classic';
    config.scenarioWeights = {
      solo: this.decimal('trainingSoloWeight', 0, 1),
      heuristic: this.decimal('trainingHeuristicWeight', 0, 1),
      cohort: this.decimal('trainingCohortWeight', 0, 1),
    };
    if (Object.values(config.scenarioWeights).every((weight) => weight === 0)) {
      this.rejectField(this.input('trainingSoloWeight'), 'Хотя бы один вес сценария должен быть больше нуля');
    }
    config.fitnessWeights = {
      score: this.decimal('trainingFitnessScore', 0, 1_000_000),
      approach: this.decimal('trainingFitnessApproach', 0, 1_000_000),
      wins: this.decimal('trainingFitnessWins', 0, 1_000_000),
      survival: this.decimal('trainingFitnessSurvival', 0, 1_000_000),
      aliveAtLimit: this.decimal('trainingFitnessAlive', 0, 1_000_000),
      death: this.decimal('trainingFitnessDeath', 0, 1_000_000),
      cycle: 0,
    };
    return config;
  }

  private readLabSettings(): TrainingLabSettings {
    return {
      displayMode: this.readDisplayMode(),
      workerSelection: this.select('trainingWorkerSelection').value === 'manual'
        ? 'manual'
        : 'automatic',
      workerCount: this.integer('trainingWorkerCount', 1),
      checkpointEvery: this.integer('trainingCheckpointEvery', 1, 100),
    };
  }

  private writeFitnessValues(config: GeneticTrainingConfig): void {
    this.setValue('trainingFitnessScore', config.fitnessWeights.score);
    this.setValue('trainingFitnessApproach', config.fitnessWeights.approach ?? 0);
    this.setValue('trainingFitnessWins', config.fitnessWeights.wins);
    this.setValue('trainingFitnessSurvival', config.fitnessWeights.survival);
    this.setValue('trainingFitnessAlive', config.fitnessWeights.aliveAtLimit);
    this.setValue('trainingFitnessDeath', config.fitnessWeights.death);
    this.renderFitnessFormula();
  }

  private renderFitnessFormula(): void {
    const value = (id: string) => this.input(id).value || '0';
    this.element('trainingFitnessFormula').textContent = [
      `Fitness = очки × ${value('trainingFitnessScore')}`,
      `+ приближение к еде × ${value('trainingFitnessApproach')}`,
      `+ победы × ${value('trainingFitnessWins')}`,
      `+ min(1, тики / лимит) × ${value('trainingFitnessSurvival')}`,
      `+ (жива в конце ? ${value('trainingFitnessAlive')} : −${value('trainingFitnessDeath')}).`,
    ].join(' ');
  }

  private applyWorkerSelection(): void {
    const manual = this.select('trainingWorkerSelection').value === 'manual';
    this.input('trainingWorkerCount').disabled = !manual
      || this.select('trainingWorkerSelection').disabled;
    const enteredCount = Number(this.input('trainingWorkerCount').value);
    const count = resolveTrainingWorkerCount(
      manual ? 'manual' : 'automatic',
      Number.isInteger(enteredCount) && enteredCount >= 1 ? enteredCount : 1,
    );
    this.element('trainingWorkerSummary').textContent = (
      `Будет использовано evaluation Worker: ${count}; доступно ядер: ${navigator.hardwareConcurrency || 'неизвестно'}.`
    );
  }

  private readDisplayMode(): TrainingDisplayMode {
    return this.select('trainingDisplayMode').value === 'background' ? 'background' : 'visual';
  }

  private applyDisplayMode(): void {
    this.displayMode = this.readDisplayMode();
    const background = this.displayMode === 'background';
    this.options.outputHost.classList.toggle('training-background-mode', background);
    this.options.canvas.classList.toggle('training-canvas-hidden', background);
    this.element('trainingReplaySection').classList.toggle('training-control-hidden', background);
    if (background) {
      this.replay?.stop();
      this.replay = null;
      this.activePreview = null;
      this.queuedChampion = null;
      this.options.previewPanel.classList.add('training-preview-header');
      this.options.previewPanel.textContent = 'Фоновый режим: Canvas и анимация отключены.';
      this.setPowerStatus('Wake Lock включится после запуска обучения.');
    } else {
      this.renderPreviewHeader();
      this.setPowerStatus('Визуальный режим не блокирует переход компьютера в сон.');
    }
  }

  private renderGeneration(report: GenerationReport, totalGenerations: number): void {
    this.setStatus(
      `Поколение ${report.generation}/${totalGenerations}; лучший fitness ${format(report.bestFitness)}`,
    );
    this.appendGenerationRow(report);
    this.renderChart();
  }

  private renderBackgroundProgress(report: GenerationReport, totalGenerations: number): void {
    const updateInterval = Math.max(1, Math.floor(totalGenerations / 100));
    if (
      report.generation === 1
      || report.generation === totalGenerations
      || report.generation % updateInterval === 0
    ) {
      this.setStatus(
        `Фоновое обучение: ${report.generation}/${totalGenerations}; лучший fitness ${format(report.bestFitness)}`,
      );
    }
  }

  private renderExecutionProgress(
    report: GenerationReport,
    totalGenerations: number,
    workerCount: number,
  ): void {
    const remainingMs = Math.max(0, totalGenerations - report.generation) * report.elapsedMs;
    this.element('trainingExecutionWorkers').textContent = String(workerCount);
    this.element('trainingExecutionSimulations').textContent = format(report.simulationsPerSecond);
    this.element('trainingExecutionTicks').textContent = format(report.ticksPerSecond ?? 0);
    this.element('trainingExecutionGenerationTime').textContent = formatDuration(report.elapsedMs);
    this.element('trainingExecutionRemaining').textContent = formatDuration(remainingMs);
  }

  private appendGenerationRow(report: GenerationReport): void {
    const row = document.createElement('tr');
    [
      report.generation,
      format(report.bestFitness),
      format(report.meanFitness),
      format(report.medianFitness),
      report.validationFitness === undefined ? '—' : format(report.validationFitness),
      format(report.bestMetrics.averageScore),
      format(report.bestMetrics.averageFoodApproach ?? 0),
      format(report.bestMetrics.averageSurvivedTicks),
      `${format(report.bestMetrics.winRate * 100)}%`,
      format(report.diversity),
      `${format(report.simulationsPerSecond)} сим/с`,
      `${format(report.ticksPerSecond ?? 0)} тиков/с`,
      formatDuration(report.elapsedMs),
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    this.element('trainingReportBody').prepend(row);
  }

  private renderCondensedReport(): void {
    const reportBody = this.element('trainingReportBody');
    reportBody.replaceChildren();
    const maxVisibleReports = 200;
    const step = Math.max(1, Math.ceil(this.reports.length / maxVisibleReports));
    const visibleReports = this.reports.filter((_, index) => (
      index % step === 0 || index === this.reports.length - 1
    ));
    visibleReports.forEach((report) => this.appendGenerationRow(report));
    this.renderChart(visibleReports);
  }

  private renderChart(reports: GenerationReport[] = this.reports): void {
    const svg = this.element('trainingChart') as unknown as SVGSVGElement;
    while (svg.firstChild) svg.firstChild.remove();
    if (reports.length === 0) return;
    const width = 600;
    const height = 220;
    const values = reports.flatMap((report) => [
      report.bestFitness,
      report.meanFitness,
      report.medianFitness,
      ...(report.validationFitness === undefined ? [] : [report.validationFitness]),
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    this.renderChartAxes(svg, reports, width, height, min, max);
    this.addChartLine(svg, reports.map((report) => report.bestFitness), 'training-chart-best', width, height, min, range);
    this.addChartLine(svg, reports.map((report) => report.meanFitness), 'training-chart-mean', width, height, min, range);
    this.addChartLine(svg, reports.map((report) => report.medianFitness), 'training-chart-median', width, height, min, range);
    const validationPoints = reports
      .map((report, index) => ({ index, value: report.validationFitness }))
      .filter((item): item is { index: number; value: number } => item.value !== undefined);
    for (const point of validationPoints) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'training-chart-validation');
      circle.setAttribute('cx', String(scaleX(point.index, reports.length, width)));
      circle.setAttribute('cy', String(scaleY(point.value, min, range, height)));
      circle.setAttribute('r', '4');
      svg.appendChild(circle);
    }
  }

  private renderChartAxes(
    svg: SVGSVGElement,
    reports: GenerationReport[],
    width: number,
    height: number,
    min: number,
    max: number,
  ): void {
    for (let index = 0; index <= 4; index++) {
      const y = 12 + index * (height - 24) / 4;
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('class', 'training-chart-grid');
      gridLine.setAttribute('x1', '12');
      gridLine.setAttribute('x2', String(width - 12));
      gridLine.setAttribute('y1', String(y));
      gridLine.setAttribute('y2', String(y));
      svg.appendChild(gridLine);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'training-chart-axis-label');
      label.setAttribute('x', '16');
      label.setAttribute('y', String(Math.max(10, y - 3)));
      label.textContent = format(max - index * (max - min) / 4);
      svg.appendChild(label);
    }
    for (let index = 0; index <= 4; index++) {
      const reportIndex = Math.round(index * (reports.length - 1) / 4);
      const x = scaleX(reportIndex, reports.length, width);
      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('class', 'training-chart-grid');
      gridLine.setAttribute('x1', String(x));
      gridLine.setAttribute('x2', String(x));
      gridLine.setAttribute('y1', '12');
      gridLine.setAttribute('y2', String(height - 12));
      svg.appendChild(gridLine);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'training-chart-axis-label training-chart-axis-label-x');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(height + 14));
      label.textContent = String(reports[reportIndex].generation);
      svg.appendChild(label);
    }
    const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisLabel.setAttribute('class', 'training-chart-axis-title');
    xAxisLabel.setAttribute('x', String(width / 2));
    xAxisLabel.setAttribute('y', '244');
    xAxisLabel.textContent = 'X — поколение';
    svg.appendChild(xAxisLabel);
    const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yAxisLabel.setAttribute('class', 'training-chart-axis-title');
    yAxisLabel.setAttribute('transform', 'translate(596 116) rotate(-90)');
    yAxisLabel.textContent = 'Y — fitness';
    svg.appendChild(yAxisLabel);
  }

  private addChartLine(
    svg: SVGSVGElement,
    values: number[],
    className: string,
    width: number,
    height: number,
    min: number,
    range: number,
  ): void {
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('class', className);
    polyline.setAttribute('points', values.map((value, index) =>
      `${scaleX(index, values.length, width)},${scaleY(value, min, range, height)}`
    ).join(' '));
    svg.appendChild(polyline);
  }

  private startReplay(model: TrainedModelArtifact): void {
    if (this.runner.isRunning()) return;
    if (this.displayMode === 'background') {
      this.select('trainingDisplayMode').value = 'visual';
      this.applyDisplayMode();
    }
    this.replay?.stop();
    this.replay = null;
    this.activePreview = null;
    const compatibleOpponent = this.savedModels.find((candidate) => (
      candidate.id !== model.id && candidate.topology.join(',') === model.topology.join(',')
    ));
    this.playPreview({
      id: model.id,
      generation: null,
      fitness: model.trainingFitness,
      recordFitness: model.trainingFitness,
      recordGeneration: 0,
      recordValidationFitness: model.validationFitness,
      genome: new Float32Array(model.genome),
      config: model.trainingConfig,
      metrics: model.metrics,
      source: 'saved',
      currentFoodEaten: 0,
      cohortOpponent: compatibleOpponent ? {
        id: compatibleOpponent.id,
        genome: new Float32Array(compatibleOpponent.genome),
      } : undefined,
      cohortOpponentName: compatibleOpponent?.name,
    });
  }

  private queueChampionPreview(
    champion: TrainingCandidateResult,
    generation: number,
    recordFitness: number,
    recordGeneration: number,
    recordValidationFitness: number | undefined,
    config: GeneticTrainingConfig,
    cohortOpponent?: TrainingCandidateGenome,
  ): void {
    this.queuedChampion = {
      id: champion.id,
      generation,
      fitness: champion.fitness,
      recordFitness,
      recordGeneration,
      recordValidationFitness,
      genome: champion.genome.slice(),
      config,
      metrics: champion.metrics,
      source: 'training',
      currentFoodEaten: 0,
      cohortOpponent: cohortOpponent ? {
        id: cohortOpponent.id,
        genome: cohortOpponent.genome.slice(),
      } : undefined,
    };
    if (!this.replay) this.playQueuedChampion();
  }

  private playQueuedChampion(): void {
    if (!this.queuedChampion) return;
    const preview = this.queuedChampion;
    this.queuedChampion = null;
    this.playPreview(preview);
  }

  private playPreview(preview: ChampionPreview): void {
    this.activePreview = preview;
    preview.currentFoodEaten = 0;
    this.previewRun++;
    const network = createDenseNetworkFromGenome(preview.config.topology, preview.genome);
    const validationSeeds = preview.config.validationSeeds;
    const seed = validationSeeds[(this.previewRun - 1) % validationSeeds.length];
    let latestTrace: NeuralNetworkTrace | null = null;
    this.networkVisualizer?.showTopology(preview.config.topology);
    const participants = this.createPreviewParticipants(preview, network, (trace) => {
      latestTrace = trace;
    });
    let controller: ArenaDemoController;
    controller = createArenaDemoController({
      canvas: this.options.canvas,
      participants,
      level: preview.config.level,
      difficultyLevel: preview.config.difficultyLevel,
      gameMode: preview.config.gameMode,
      speedMultiplier: Number(this.select('trainingReplaySpeed').value) as ArenaSpeedMultiplier,
      seed,
      fitToViewport: true,
      onTick: (_state, result) => {
        preview.currentFoodEaten += result.events.filter((event) => event.type === 'FOOD_EATEN').length;
      },
      onRender: (state) => {
        if (this.replay !== controller) return;
        this.renderPreviewHeader(preview, state);
        if (latestTrace) this.networkVisualizer?.render(latestTrace);
      },
      onComplete: (state) => {
        if (this.replay !== controller) return;
        this.renderPreviewHeader(preview, state, true);
        if (latestTrace) this.networkVisualizer?.render(latestTrace);
        this.replay = null;
        if (this.queuedChampion) {
          this.playQueuedChampion();
        } else if (preview.source === 'training' && this.runner.isRunning()) {
          this.playPreview(preview);
        }
      },
    });
    this.replay = controller;
    this.renderPreviewHeader(preview, controller.getState());
    controller.start();
  }

  private mountNetworkVisualizer(): void {
    const middle = this.options.canvas.parentElement;
    if (!middle) return;
    const canvasColumn = document.createElement('div');
    canvasColumn.className = 'training-canvas-column';
    const replayControls = document.createElement('label');
    replayControls.className = 'training-replay-scenario';
    const replayLabel = document.createElement('span');
    replayLabel.textContent = 'Просмотр отбора';
    const replaySelect = document.createElement('select');
    replaySelect.id = 'trainingReplayScenario';
    replaySelect.className = 'dev-input training-replay-scenario-select';
    replaySelect.innerHTML = [
      '<option value="solo">Одиночная</option>',
      '<option value="heuristic">Против эвристики</option>',
      '<option value="cohort">Против поколения</option>',
    ].join('');
    replayControls.append(replayLabel, replaySelect);
    this.addParameterHelp(
      replaySelect,
      replayControls,
      'Выбирает только демонстрационную партию: одиночную, против эвристики или против другой нейросети. На обучение и fitness не влияет.',
    );
    const replayToolbar = document.createElement('div');
    replayToolbar.id = 'trainingReplayToolbar';
    replayToolbar.className = 'training-replay-toolbar';
    const replaySpeed = this.element('trainingReplaySection');
    replayToolbar.append(replayControls, replaySpeed);
    const canvasStage = document.createElement('div');
    canvasStage.className = 'training-canvas-stage';
    this.options.canvas.replaceWith(canvasColumn);
    canvasStage.appendChild(this.options.canvas);
    canvasColumn.append(replayToolbar, canvasStage);
    this.replayScenarioSelect = replaySelect;
    const networkHost = document.createElement('aside');
    middle.insertBefore(networkHost, canvasColumn.nextSibling);
    this.networkVisualizer = new TrainingNetworkVisualizer(networkHost);
    this.networkVisualizer.reset();
  }

  private createPreviewParticipants(
    preview: ChampionPreview,
    network: ReturnType<typeof createDenseNetworkFromGenome>,
    onTrace: (trace: NeuralNetworkTrace) => void,
  ): ArenaParticipant[] {
    const participants: ArenaParticipant[] = [{
      name: 'Чемпион',
      algorithm: createNeuralArenaAlgorithm({ id: preview.id, network, onTrace }),
    }];
    const scenario = this.readReplayScenario();
    if (scenario === 'heuristic') {
      const heuristicId = (this.previewRun - 1) % 2 === 0 ? 'basic' : 'solid';
      participants.push({
        name: `Эвристика ${heuristicId}`,
        algorithm: getHeuristicAlgorithmById(heuristicId),
      });
    } else if (scenario === 'cohort') {
      const opponent = preview.cohortOpponent ?? {
        id: `${preview.id}-mirror`,
        genome: preview.genome,
      };
      participants.push({
        name: preview.cohortOpponent
          ? preview.cohortOpponentName ?? 'Соперник поколения'
          : 'Копия нейросети',
        algorithm: createNeuralArenaAlgorithm({
          id: opponent.id,
          network: createDenseNetworkFromGenome(preview.config.topology, opponent.genome),
        }),
      });
    }
    return participants;
  }

  private restartPreview(): void {
    const preview = this.activePreview;
    if (!preview) return;
    this.replay?.stop();
    this.replay = null;
    this.playPreview(preview);
  }

  private readReplayScenario(): TrainingReplayScenario {
    const value = this.replayScenarioSelect?.value;
    return value === 'heuristic' || value === 'cohort' ? value : 'solo';
  }

  private renderPreviewHeader(
    preview: ChampionPreview | null = this.activePreview,
    state?: GameState,
    completed = false,
  ): void {
    const panel = this.options.previewPanel;
    panel.classList.add('training-preview-header');
    panel.replaceChildren();
    const snake = state?.snakes[0];
    const shownGeneration = preview?.generation === null
      ? 'Сохранённая'
      : preview ? String(preview.generation) : '—';
    const gameStatus = snake
      ? completed ? snake.deathReason ?? 'Завершена' : 'Играет'
      : 'Запуск…';
    const rows: Array<[string, Array<[string, string]>]> = [
      ['Validation-чемпион', [
        ['Поколение', preview ? String(preview.recordGeneration || '—') : '—'],
        ['Training fitness', preview ? format(preview.recordFitness) : '—'],
        ['Validation', preview?.recordValidationFitness === undefined
          ? '—'
          : format(preview.recordValidationFitness)],
      ]],
      ['Показан чемпион', [
        ['Поколение', shownGeneration],
        ['Fitness', preview ? format(preview.fitness) : '—'],
        ['Средние очки', preview ? format(preview.metrics.averageScore) : '—'],
        ['Еда', preview ? format(preview.metrics.averageFoodEaten) : '—'],
        ['Выживание', preview ? `${format(preview.metrics.averageSurvivedTicks)} тиков` : '—'],
      ]],
      ['Текущая игра', [
        ['Тик', snake ? String(state?.tickCount ?? 0) : '—'],
        ['Очки', snake ? String(snake.score) : '—'],
        ['Еда', snake ? String(preview?.currentFoodEaten ?? 0) : '—'],
        ['Длина', snake ? String(snake.segments.length) : '—'],
        ['Состояние', gameStatus],
      ]],
    ];
    const table = document.createElement('table');
    table.className = 'training-preview-table';
    const body = document.createElement('tbody');
    rows.forEach(([title, metrics]) => {
      const row = document.createElement('tr');
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = title;
      row.appendChild(heading);
      for (let index = 0; index < 5; index += 1) {
        const cell = document.createElement('td');
        const metric = metrics[index];
        if (metric) {
          const key = document.createElement('span');
          key.className = 'training-preview-key';
          key.textContent = metric[0];
          const value = document.createElement('strong');
          value.className = 'training-preview-value';
          value.textContent = metric[1];
          cell.append(key, value);
        }
        row.appendChild(cell);
      }
      body.appendChild(row);
    });
    table.appendChild(body);
    panel.appendChild(table);
  }

  private async completeTraining(result: GeneticTrainingResult, runId: string): Promise<void> {
    const completedResult = {
      ...result,
      model: this.withLabSettings(result.model),
    };
    this.result = completedResult;
    this.wakeLock.stop();
    this.setPowerStatus('Wake Lock выключен: обучение завершено.');
    this.setRunning(false);
    if (this.displayMode === 'background') this.renderCondensedReport();
    this.renderSummary(completedResult.model);
    try {
      await this.checkpointWrite;
      await this.repository.save(completedResult.model);
      await this.checkpointRepository.delete(runId);
      await this.renderModels();
      await this.renderCheckpoints();
      this.fineTuneModel = null;
      this.setStatus(
        `Обучение завершено: ${result.completedGenerations} поколений. Модель сохранена автоматически.`,
      );
    } catch (error) {
      this.setStatus(
        `Обучение завершено, но автосохранение не удалось: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private queueCheckpointSave(
    checkpoint: GeneticTrainingCheckpoint,
    model: TrainedModelArtifact,
    paused = false,
  ): void {
    const operation = this.checkpointWrite.then(async () => {
      await this.checkpointRepository.save(checkpoint);
      await this.repository.save(model);
      await Promise.all([this.renderCheckpoints(), this.renderModels()]);
    });
    this.checkpointWrite = operation.catch(() => undefined);
    operation.then(() => {
      if (!paused) return;
      this.reports = checkpoint.reports.map((report) => ({ ...report }));
      this.renderCondensedReport();
      this.wakeLock.stop();
      this.setPowerStatus('Wake Lock выключен: обучение поставлено на паузу.');
      this.setRunning(false);
      this.setStatus(
        `Обучение сохранено после поколения ${checkpoint.nextGeneration - 1}. Его можно продолжить.`,
      );
    }).catch((error) => {
      if (paused) this.setRunning(false);
      this.setStatus(
        `Не удалось сохранить checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private renderSummary(model: TrainedModelArtifact): void {
    const summary = this.element('trainingSummary');
    summary.replaceChildren();
    const metrics = model.metrics;
    const rows: Array<[string, string]> = [
      ['Training fitness', format(model.trainingFitness)],
      ['Validation fitness', model.validationFitness === undefined ? '—' : format(model.validationFitness)],
      ['Средние очки', format(metrics.averageScore)],
      ['Средняя еда', format(metrics.averageFoodEaten)],
      ['Среднее приближение к еде', format(metrics.averageFoodApproach ?? 0)],
      ['Среднее выживание', `${format(metrics.averageSurvivedTicks)} тиков`],
      ['Средняя длина', format(metrics.averageFinalLength)],
      ['Победы', `${format(metrics.winRate * 100)}%`],
      ['Осталась жива', `${format(metrics.aliveRate * 100)}%`],
      ['Причины смерти', Object.entries(metrics.deathReasons).map(([reason, count]) => `${reason}: ${count}`).join(', ') || '—'],
    ];
    for (const [labelText, valueText] of rows) {
      const row = document.createElement('div');
      row.className = 'training-summary-row';
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('strong');
      value.textContent = valueText;
      row.append(label, value);
      summary.appendChild(row);
    }
  }

  private async saveCurrentModel(): Promise<void> {
    if (!this.result) return;
    try {
      await this.repository.save(this.result.model);
      this.setStatus('Модель сохранена в браузере');
      await this.renderModels();
    } catch (error) {
      this.setStatus(`Не удалось сохранить модель: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async importSelectedModel(): Promise<void> {
    const file = this.fileInput().files?.[0];
    this.fileInput().value = '';
    if (!file) return;
    try {
      const model = parseModelArtifact(await file.text());
      await this.repository.save(model);
      this.setStatus(`Модель «${model.name}» импортирована`);
      this.startReplay(model);
      await this.renderModels();
    } catch (error) {
      this.setStatus(`Ошибка импорта: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async renderModels(): Promise<void> {
    const container = this.element('trainingModels');
    container.replaceChildren();
    const models = await this.repository.list();
    this.savedModels = models;
    if (models.length === 0) {
      container.textContent = 'Сохранённых моделей пока нет.';
      return;
    }
    for (const model of models) {
      const row = document.createElement('div');
      row.className = 'training-model-row';
      const details = document.createElement('div');
      details.className = 'training-model-details';
      const name = document.createElement('strong');
      name.className = 'training-model-name';
      name.textContent = model.name.trim() || 'Модель без названия';
      const savedAt = new Date(model.createdAt);
      const metadata = document.createElement('span');
      metadata.className = 'training-model-metadata';
      metadata.textContent = [
        `Сохранена: ${Number.isNaN(savedAt.getTime()) ? 'дата неизвестна' : savedAt.toLocaleString('ru-RU')}`,
        `Fitness: ${format(model.trainingFitness)}`,
      ].join(' · ');
      details.append(name, metadata);
      const replayButton = document.createElement('button');
      replayButton.type = 'button';
      replayButton.className = 'btn btn-secondary btn-small';
      replayButton.textContent = 'Показать';
      replayButton.addEventListener('click', () => this.startReplay(model));
      const downloadButton = document.createElement('button');
      downloadButton.type = 'button';
      downloadButton.className = 'btn btn-secondary btn-small';
      downloadButton.textContent = 'Скачать';
      downloadButton.addEventListener('click', () => this.downloadModel(model));
      const fineTuneButton = document.createElement('button');
      fineTuneButton.type = 'button';
      fineTuneButton.className = 'btn btn-secondary btn-small';
      fineTuneButton.textContent = 'Дообучить';
      fineTuneButton.addEventListener('click', () => this.prepareFineTuning(model));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn-secondary btn-small';
      deleteButton.textContent = 'Удалить';
      deleteButton.addEventListener('click', () => void this.deleteSavedModel(model));
      const actions = document.createElement('div');
      actions.className = 'training-model-actions';
      actions.append(replayButton, fineTuneButton, downloadButton, deleteButton);
      row.append(details, actions);
      container.appendChild(row);
    }
  }

  private async deleteSavedModel(model: TrainedModelArtifact): Promise<void> {
    if (this.runner.isRunning()) return;
    try {
      await this.repository.delete(model.id);
      if (this.fineTuneModel?.id === model.id) this.fineTuneModel = null;
      if (this.activePreview?.source === 'saved' && this.activePreview.id === model.id) {
        this.replay?.stop();
        this.replay = null;
        this.activePreview = null;
        this.queuedChampion = null;
        this.networkVisualizer?.reset();
        this.renderPreviewHeader();
      }
      await this.renderModels();
      this.setStatus(`Модель «${model.name}» удалена`);
    } catch (error) {
      this.setStatus(`Ошибка удаления модели: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async renderCheckpoints(): Promise<void> {
    const container = this.element('trainingCheckpoints');
    container.replaceChildren();
    try {
      const checkpoints = await this.checkpointRepository.list();
      if (checkpoints.length === 0) {
        container.textContent = 'Незавершённых прогонов нет.';
        return;
      }
      for (const checkpoint of checkpoints) {
        const row = document.createElement('div');
        row.className = 'training-model-row';
        const label = document.createElement('span');
        label.className = 'training-model-name';
        label.textContent = [
          checkpoint.runId,
          `${checkpoint.nextGeneration - 1}/${checkpoint.config.generations}`,
          new Date(checkpoint.updatedAt).toLocaleString('ru-RU'),
        ].join(' · ');
        const continueButton = document.createElement('button');
        continueButton.type = 'button';
        continueButton.className = 'btn btn-primary btn-small';
        continueButton.textContent = 'Продолжить';
        continueButton.addEventListener('click', () => {
          if (this.runner.isRunning()) return;
          this.writeConfigValues(checkpoint.config);
          this.startTraining(checkpoint);
        });
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-secondary btn-small';
        deleteButton.textContent = 'Удалить';
        deleteButton.addEventListener('click', () => {
          if (this.runner.isRunning()) return;
          this.checkpointRepository.delete(checkpoint.runId)
            .then(() => this.renderCheckpoints())
            .catch((error) => this.setStatus(`Ошибка удаления: ${String(error)}`));
        });
        const actions = document.createElement('div');
        actions.className = 'training-model-actions';
        actions.append(continueButton, deleteButton);
        row.append(label, actions);
        container.appendChild(row);
      }
    } catch (error) {
      container.textContent = 'IndexedDB недоступна: продолжение обучения не будет сохранено.';
    }
  }

  private prepareFineTuning(model: TrainedModelArtifact): void {
    if (this.runner.isRunning()) return;
    this.fineTuneModel = model;
    this.writeConfigValues(model.trainingConfig);
    if (model.labSettings) this.writeLabSettings(model.labSettings);
    this.setStatus(`Модель «${model.name}» выбрана для дообучения. Настройте параметры и нажмите «Начать».`);
  }

  private writeConfigValues(config: GeneticTrainingConfig): void {
    this.setValue('trainingGenerations', config.generations);
    this.setValue('trainingPopulation', config.populationSize);
    this.setValue('trainingElite', config.eliteCount);
    this.setValue('trainingTournament', config.tournamentSize);
    this.setValue('trainingHiddenLayers', config.topology.slice(1, -1).join(','));
    this.setValue('trainingCrossover', config.crossoverRate);
    this.setValue('trainingMutationRate', config.mutationRate);
    this.setValue('trainingMutationSigma', config.mutationSigma);
    this.setValue('trainingValidationEvery', config.validationEvery);
    this.setValue('trainingSoloWeight', config.scenarioWeights.solo);
    this.setValue('trainingHeuristicWeight', config.scenarioWeights.heuristic);
    this.setValue('trainingCohortWeight', config.scenarioWeights.cohort);
    this.setValue('trainingLevel', config.level);
    this.setValue('trainingDifficulty', config.difficultyLevel);
    this.setValue('trainingSeed', config.trainingSeeds[0]);
    this.setValue('trainingMaxTicks', config.maxTicks);
    this.setValue('trainingGameMode', config.gameMode);
    this.writeFitnessValues(config);
  }

  private writeLabSettings(settings: TrainingLabSettings): void {
    this.setValue('trainingDisplayMode', settings.displayMode);
    this.setValue('trainingWorkerSelection', settings.workerSelection);
    this.setValue('trainingWorkerCount', settings.workerCount);
    this.setValue('trainingCheckpointEvery', settings.checkpointEvery);
    this.applyDisplayMode();
    this.applyWorkerSelection();
  }

  private withLabSettings(model: TrainedModelArtifact): TrainedModelArtifact {
    if (!this.activeLabSettings) return model;
    return {
      ...model,
      labSettings: { ...this.activeLabSettings },
    };
  }

  private downloadModel(model: TrainedModelArtifact): void {
    this.downloadFile(`${model.id}.json`, JSON.stringify(model, null, 2), 'application/json');
  }

  private downloadCsv(): void {
    if (this.reports.length === 0) return;
    const header = [
      'generation', 'bestFitness', 'meanFitness', 'medianFitness', 'validationFitness',
      'averageScore', 'averageSurvivedTicks', 'winRate', 'aliveRate', 'diversity',
      'averageFoodApproach',
      'simulationsPerSecond',
      'ticksPerSecond', 'elapsedMs',
    ];
    const rows = this.reports.map((report) => [
      report.generation,
      report.bestFitness,
      report.meanFitness,
      report.medianFitness,
      report.validationFitness ?? '',
      report.bestMetrics.averageScore,
      report.bestMetrics.averageSurvivedTicks,
      report.bestMetrics.winRate,
      report.bestMetrics.aliveRate,
      report.diversity,
      report.bestMetrics.averageFoodApproach ?? 0,
      report.simulationsPerSecond,
      report.ticksPerSecond ?? '',
      report.elapsedMs,
    ].join(','));
    this.downloadFile('genetic-training-report.csv', [header.join(','), ...rows].join('\n'), 'text/csv');
  }

  private downloadFile(fileName: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private clearReport(): void {
    this.element('trainingReportBody').replaceChildren();
    this.element('trainingSummary').textContent = 'Обучение ещё не завершено.';
    this.renderChart();
  }

  private setRunning(running: boolean): void {
    this.button('trainingStart').disabled = running;
    this.button('trainingPause').disabled = !running;
    this.button('trainingAbort').disabled = !running;
    this.button('trainingSave').disabled = running || !this.result;
    this.button('trainingDownload').disabled = running || !this.result;
    this.button('trainingCsv').disabled = running || this.reports.length === 0;
    this.button('trainingMenu').disabled = running;
    this.select('trainingDisplayMode').disabled = running;
    this.select('trainingWorkerSelection').disabled = running;
    this.input('trainingCheckpointEvery').disabled = running;
    this.applyWorkerSelection();
  }

  private setStatus(text: string): void {
    this.element('trainingStatus').textContent = text;
  }

  private setPowerStatus(text: string): void {
    this.element('trainingPowerStatus').textContent = text;
  }

  private integer(id: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    const input = this.input(id);
    const rawValue = input.value.trim();
    const value = Number(rawValue);
    const name = this.fieldName(input);
    if (rawValue === '' || !Number.isInteger(value)) {
      this.rejectField(input, `${name}: укажите целое число`);
    }
    if (value < min || value > max) {
      const range = max === Number.MAX_SAFE_INTEGER
        ? `значение должно быть не меньше ${min}`
        : `допустимое значение от ${min} до ${max}`;
      this.rejectField(input, `${name}: ${range}`);
    }
    return value;
  }

  private decimal(id: string, min: number, max: number): number {
    const input = this.input(id);
    const rawValue = input.value.trim();
    const value = Number(rawValue);
    const name = this.fieldName(input);
    if (rawValue === '' || !Number.isFinite(value)) {
      this.rejectField(input, `${name}: укажите число`);
    }
    if (value < min || value > max) {
      this.rejectField(input, `${name}: допустимое значение от ${min} до ${max}`);
    }
    return value;
  }

  private fieldName(input: HTMLInputElement): string {
    return input.closest('label')?.querySelector('.dev-row-label')?.textContent?.trim() || input.id;
  }

  private rejectField(input: HTMLInputElement, message: string): never {
    input.setCustomValidity(message);
    input.setAttribute('aria-invalid', 'true');
    input.reportValidity();
    input.focus();
    throw new Error(message);
  }

  private setValue(id: string, value: string | number): void {
    (this.element(id) as HTMLInputElement | HTMLSelectElement).value = String(value);
  }

  private element(id: string): HTMLElement {
    const element = this.options.panel.querySelector<HTMLElement>(`#${id}`)
      ?? this.options.outputHost.querySelector<HTMLElement>(`#${id}`)
      ?? this.options.canvas.closest('.training-canvas-column')?.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Training control #${id} was not found`);
    return element;
  }

  private input(id: string): HTMLInputElement {
    return this.element(id) as HTMLInputElement;
  }

  private select(id: string): HTMLSelectElement {
    return this.element(id) as HTMLSelectElement;
  }

  private button(id: string): HTMLButtonElement {
    return this.element(id) as HTMLButtonElement;
  }

  private fileInput(): HTMLInputElement {
    return this.input('trainingFile');
  }
}

function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return '—';
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  if (minutes > 0) return `${minutes}м ${seconds}с`;
  return `${seconds}с`;
}

function scaleX(index: number, count: number, width: number): number {
  return 12 + index * (width - 24) / Math.max(1, count - 1);
}

function scaleY(value: number, min: number, range: number, height: number): number {
  return height - 12 - (value - min) / range * (height - 24);
}

const trainingParameterHelp: Record<string, string> = {
  trainingDisplayMode: 'Визуальный режим показывает партии чемпионов. Фоновый отключает Canvas и экономит ресурсы.',
  trainingWorkerSelection: 'Автоматически оставляет два ядра системе. Ручной режим позволяет выбрать количество evaluation Worker.',
  trainingWorkerCount: 'Число параллельных Worker. Больше Worker обычно ускоряет обучение, но увеличивает нагрузку и нагрев.',
  trainingCheckpointEvery: 'Через сколько завершённых поколений сохранять полный прогон. Меньше — надёжнее, но чаще запись в IndexedDB.',
  trainingGenerations: 'Количество поколений эволюции. Верхнего прикладного ограничения нет; большое значение увеличивает время обучения.',
  trainingPopulation: 'Количество нейросетей в поколении. Большая популяция повышает разнообразие и пропорционально увеличивает время.',
  trainingElite: 'Число лучших кандидатов, переходящих в следующее поколение без мутации.',
  trainingTournament: 'Сколько случайных кандидатов сравнивается при выборе родителя. Большее значение усиливает отбор.',
  trainingHiddenLayers: 'Количество нейронов в скрытых слоях через запятую. Большая сеть медленнее и требует больше данных.',
  trainingCrossover: 'Вероятность смешать веса двух родителей. Ноль отключает скрещивание.',
  trainingMutationRate: 'Вероятность изменения каждого веса потомка. Слишком большое значение разрушает удачные решения.',
  trainingMutationSigma: 'Средняя сила изменения мутировавшего веса.',
  trainingLevel: 'Уровень правил и размера поля, на котором оцениваются кандидаты.',
  trainingDifficulty: 'Сложность игровых правил и соперников в Arena.',
  trainingGameMode: 'Классические правила или режим выживания для всех тренировочных партий.',
  trainingSeed: 'Базовое значение детерминированной случайности. Из него для каждого поколения выводится новый общий набор карт; одинаковые настройки и seed воспроизводят весь прогон.',
  trainingMaxTicks: 'Максимальная длина одной партии. Большое значение позволяет долгие стратегии, но сильно замедляет обучение.',
  trainingValidationEvery: 'Период проверки лучшего кандидата поколения на постоянных validation seed. Лучший validation-результат определяет сохраняемую модель, но не влияет на генетический отбор следующей популяции.',
  trainingSoloWeight: 'Вес одиночных партий. Ноль полностью отключает сценарий и ускоряет поколение.',
  trainingHeuristicWeight: 'Вес партий против basic/solid ботов. Ноль полностью отключает сценарий.',
  trainingCohortWeight: 'Вес партий против нейросетей текущего поколения. Ноль полностью отключает сценарий.',
  trainingFitnessScore: 'Награда за каждое игровое очко.',
  trainingFitnessApproach: 'Награда за каждую новую клетку приближения к выбранной еде. Отход назад и повторное движение по уже пройденному пути не награждаются.',
  trainingFitnessWins: 'Награда за выигранный уровень или раунд.',
  trainingFitnessSurvival: 'Награда за долю прожитых тиков относительно лимита.',
  trainingFitnessAlive: 'Дополнительная награда, если змейка осталась жива в конце партии.',
  trainingFitnessDeath: 'Штраф за смерть. Ноль отключает этот штраф.',
  trainingReplaySpeed: 'Скорость только Canvas-демонстрации. На скорость headless-обучения не влияет.',
};

const trainingLabMarkup = `
  <div class="dev-panel training-lab-panel">
    <h2 class="dev-panel-title">Генетическое обучение</h2>
    <p class="training-lab-about-text">Популяции нейросетей обучаются в отдельном Web Worker. В визуальном режиме Canvas показывает лучший кандидат самого свежего завершённого поколения.</p>
    <div class="dev-section">
      <div class="dev-section-title">Режим выполнения</div>
      <label class="dev-row"><span class="dev-row-label">Отображение</span><select id="trainingDisplayMode" class="dev-input"><option value="visual">Визуальный — с Canvas</option><option value="background">Фоновый — без анимации</option></select></label>
      <p class="training-lab-policy-note">Фоновый режим не запускает демонстрацию кандидатов и редко обновляет интерфейс, поэтому подходит для длинных ночных прогонов.</p>
      <div id="trainingPowerStatus" class="training-power-status" aria-live="polite"></div>
    </div>
    <div class="dev-section">
      <div class="dev-section-title">Параллельное выполнение</div>
      <label class="dev-row"><span class="dev-row-label">Worker</span><select id="trainingWorkerSelection" class="dev-input"><option value="automatic">Автоматически</option><option value="manual">Вручную</option></select></label>
      <label class="dev-row"><span class="dev-row-label">Количество</span><input id="trainingWorkerCount" class="dev-input" type="number" min="1" step="1"></label>
      <label class="dev-row"><span class="dev-row-label">Checkpoint</span><input id="trainingCheckpointEvery" class="dev-input" type="number" min="1" max="100" step="1"></label>
      <p id="trainingWorkerSummary" class="training-lab-policy-note"></p>
    </div>
    <div class="dev-section training-config-grid">
      <div class="dev-section-title">Популяция и сеть</div>
      <label class="dev-row"><span class="dev-row-label">Поколения</span><input id="trainingGenerations" class="dev-input" type="number" min="1" step="1"></label>
      <label class="dev-row"><span class="dev-row-label">Популяция</span><input id="trainingPopulation" class="dev-input" type="number" min="4" max="256"></label>
      <label class="dev-row"><span class="dev-row-label">Элита</span><input id="trainingElite" class="dev-input" type="number" min="1"></label>
      <label class="dev-row"><span class="dev-row-label">Турнир</span><input id="trainingTournament" class="dev-input" type="number" min="2"></label>
      <label class="dev-row"><span class="dev-row-label">Скрытые слои</span><input id="trainingHiddenLayers" class="dev-input" type="text" placeholder="16,8"></label>
      <label class="dev-row"><span class="dev-row-label">Скрещивание</span><input id="trainingCrossover" class="dev-input" type="number" min="0" max="1" step="0.01"></label>
      <label class="dev-row"><span class="dev-row-label">Мутация</span><input id="trainingMutationRate" class="dev-input" type="number" min="0" max="1" step="0.001"></label>
      <label class="dev-row"><span class="dev-row-label">Сила мутации</span><input id="trainingMutationSigma" class="dev-input" type="number" min="0.0001" step="0.001"></label>
    </div>
    <div class="dev-section">
      <div class="dev-section-title">Правила оценки</div>
      <label class="dev-row"><span class="dev-row-label">Уровень</span><input id="trainingLevel" class="dev-input" type="number" min="1" max="100"></label>
      <label class="dev-row"><span class="dev-row-label">Сложность</span><input id="trainingDifficulty" class="dev-input" type="number" min="1" max="10"></label>
      <label class="dev-row"><span class="dev-row-label">Режим</span><select id="trainingGameMode" class="dev-input"><option value="classic">Классика</option><option value="survival">Выживание</option></select></label>
      <label class="dev-row"><span class="dev-row-label">Seed</span><input id="trainingSeed" class="dev-input" type="number" min="1"></label>
      <label class="dev-row"><span class="dev-row-label">Лимит тиков</span><input id="trainingMaxTicks" class="dev-input" type="number" min="100"></label>
      <label class="dev-row"><span class="dev-row-label">Validation</span><input id="trainingValidationEvery" class="dev-input" type="number" min="1"></label>
      <label class="dev-row"><span class="dev-row-label">Одиночный вес</span><input id="trainingSoloWeight" class="dev-input" type="number" min="0" max="1" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Эвристики</span><input id="trainingHeuristicWeight" class="dev-input" type="number" min="0" max="1" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Поколение</span><input id="trainingCohortWeight" class="dev-input" type="number" min="0" max="1" step="0.1"></label>
    </div>
    <div class="dev-section">
      <div class="dev-section-title">Fitness</div>
      <label class="dev-row"><span class="dev-row-label">Очки</span><input id="trainingFitnessScore" class="dev-input" type="number" min="0" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Приближение к еде</span><input id="trainingFitnessApproach" class="dev-input" type="number" min="0" step="0.05"></label>
      <label class="dev-row"><span class="dev-row-label">Победа</span><input id="trainingFitnessWins" class="dev-input" type="number" min="0" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Выживание</span><input id="trainingFitnessSurvival" class="dev-input" type="number" min="0" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Жива в конце</span><input id="trainingFitnessAlive" class="dev-input" type="number" min="0" step="0.1"></label>
      <label class="dev-row"><span class="dev-row-label">Смерть</span><input id="trainingFitnessDeath" class="dev-input" type="number" min="0" step="0.1"></label>
      <p id="trainingFitnessFormula" class="training-lab-policy-note"></p>
    </div>
    <div class="dev-buttons training-lab-actions">
      <button id="trainingStart" type="button" class="btn btn-primary btn-small">Начать обучение</button>
      <button id="trainingPause" type="button" class="btn btn-secondary btn-small" disabled>Пауза и сохранить</button>
      <button id="trainingAbort" type="button" class="btn btn-secondary btn-small" disabled>Отменить</button>
      <button id="trainingSave" type="button" class="btn btn-secondary btn-small" disabled>Сохранить</button>
      <button id="trainingDownload" type="button" class="btn btn-secondary btn-small" disabled>Скачать</button>
      <button id="trainingCsv" type="button" class="btn btn-secondary btn-small" disabled>CSV отчёт</button>
      <button id="trainingImport" type="button" class="btn btn-secondary btn-small">Импорт</button>
      <input id="trainingFile" class="training-file-input" type="file" accept="application/json,.json">
      <button id="trainingGuide" type="button" class="btn btn-secondary btn-small">Инструкция</button>
      <button id="trainingMenu" type="button" class="btn btn-secondary btn-small">Меню</button>
    </div>
    <div id="trainingStatus" class="training-status" aria-live="polite">Настройте параметры и начните обучение.</div>
    <dl id="trainingExecutionStatus" class="training-execution-status" aria-live="polite">
      <div><dt>Worker</dt><dd id="trainingExecutionWorkers">—</dd></div>
      <div><dt>Партий/с</dt><dd id="trainingExecutionSimulations">—</dd></div>
      <div><dt>Тиков/с</dt><dd id="trainingExecutionTicks">—</dd></div>
      <div><dt>Время поколения</dt><dd id="trainingExecutionGenerationTime">—</dd></div>
      <div><dt>Осталось</dt><dd id="trainingExecutionRemaining">—</dd></div>
    </dl>
    <div class="dev-section"><div class="dev-section-title">Незавершённые прогоны</div><div id="trainingCheckpoints" class="training-models"></div></div>
    <label id="trainingReplaySection" class="training-replay-speed"><span>Validation replay</span><select id="trainingReplaySpeed" class="dev-input"><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option><option value="16">16x</option><option value="100">100x</option><option value="1000">1000x</option></select></label>
    <div class="dev-section"><div class="dev-section-title">Сохранённые модели</div><div id="trainingModels" class="training-models"></div></div>
  </div>
  <div id="trainingOutput" class="training-results-area">
    <div class="dev-section">
      <div class="dev-section-title">График fitness</div>
      <div class="training-chart-legend"><span class="training-legend-best">Лучший</span><span class="training-legend-mean">Средний</span><span class="training-legend-median">Медиана</span><span class="training-legend-validation">Validation</span></div>
      <svg id="trainingChart" class="training-chart" viewBox="0 0 600 250" role="img" aria-label="График fitness по поколениям"></svg>
    </div>
    <div class="dev-section training-report-wrap">
      <div class="dev-section-title">Поколения</div>
      <table class="training-report-table"><thead><tr><th>Поколение</th><th>Best fitness</th><th>Mean fitness</th><th>Median fitness</th><th>Validation</th><th>Средние очки</th><th>Приближение</th><th>Средние тики</th><th>Победы</th><th>Разнообразие</th><th>Партий/с</th><th>Тиков/с</th><th>Время</th></tr></thead><tbody id="trainingReportBody"></tbody></table>
    </div>
    <div class="dev-section"><div class="dev-section-title">Итоги чемпиона</div><div id="trainingSummary" class="training-summary">Обучение ещё не завершено.</div></div>
  </div>
`;
