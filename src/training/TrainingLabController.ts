import {
  calculateObservationInputSize,
  createDefaultSettings,
  createDefaultGeneticTrainingConfig,
  createDenseNetworkFromGenome,
  createNeuralArenaAlgorithm,
} from '@snake-game/core';
import type {
  GenerationReport,
  GeneticTrainingConfig,
  GeneticTrainingResult,
  TrainedModelArtifact,
} from '@snake-game/core';
import { createArenaDemoController } from '../arena/ArenaDemoRunner';
import type { ArenaDemoController, ArenaSpeedMultiplier } from '../arena/ArenaDemoRunner';
import type { TrainingLaunchConfig } from '../app/services/MenuScreenService';
import { BrowserGeneticTrainingRunner } from './BrowserGeneticTrainingRunner';
import { LocalModelRepository, parseModelArtifact } from './LocalModelRepository';

export interface TrainingLabControllerOptions {
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  initialConfig: TrainingLaunchConfig;
  onBack: () => void;
}

export class TrainingLabController {
  private readonly runner = new BrowserGeneticTrainingRunner();
  private readonly repository = new LocalModelRepository();
  private reports: GenerationReport[] = [];
  private result: GeneticTrainingResult | null = null;
  private replay: ArenaDemoController | null = null;

  constructor(private readonly options: TrainingLabControllerOptions) {}

  mount(): void {
    this.options.panel.innerHTML = trainingLabMarkup;
    this.writeInitialValues();
    this.bindActions();
    this.renderModels();
  }

  stop(): void {
    this.runner.stop();
    this.replay?.stop();
    this.replay = null;
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
  }

  private bindActions(): void {
    this.button('trainingStart').addEventListener('click', () => this.startTraining());
    this.button('trainingCancel').addEventListener('click', () => this.cancelTraining());
    this.button('trainingSave').addEventListener('click', () => this.saveCurrentModel());
    this.button('trainingDownload').addEventListener('click', () => {
      if (this.result) this.downloadModel(this.result.model);
    });
    this.button('trainingCsv').addEventListener('click', () => this.downloadCsv());
    this.button('trainingImport').addEventListener('click', () => this.fileInput().click());
    this.fileInput().addEventListener('change', () => this.importSelectedModel());
    this.button('trainingMenu').addEventListener('click', this.options.onBack);
    this.select('trainingReplaySpeed').addEventListener('change', () => {
      const speed = Number(this.select('trainingReplaySpeed').value) as ArenaSpeedMultiplier;
      this.replay?.setSpeedMultiplier(speed);
    });
  }

  private startTraining(): void {
    if (this.runner.isRunning()) return;
    try {
      const config = this.readConfig();
      this.reports = [];
      this.result = null;
      this.replay?.stop();
      this.replay = null;
      this.clearReport();
      this.setRunning(true);
      this.setStatus('Подготовка популяции…');
      this.runner.start(config, {
        onMessage: (message) => {
          if (message.type === 'generation') {
            this.reports.push(message.report);
            this.renderGeneration(message.report, config.generations);
          } else if (message.type === 'completed') {
            this.result = message.result;
            this.setRunning(false);
            this.setStatus(`Обучение завершено: ${message.result.completedGenerations} поколений`);
            this.renderSummary(message.result.model);
            this.startReplay(message.result.model);
          } else {
            this.setRunning(false);
            this.setStatus(`Ошибка: ${message.message}`);
          }
        },
      });
    } catch (error) {
      this.setRunning(false);
      this.setStatus(`Ошибка конфигурации: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private cancelTraining(): void {
    if (!this.runner.isRunning()) return;
    this.runner.stop();
    this.setRunning(false);
    this.setStatus('Обучение отменено');
  }

  private readConfig(): GeneticTrainingConfig {
    const inputSize = calculateObservationInputSize(createDefaultSettings().visionSize);
    const config = createDefaultGeneticTrainingConfig(inputSize);
    const hiddenLayers = this.input('trainingHiddenLayers').value
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 256);
    if (hiddenLayers.length === 0 || hiddenLayers.length > 4) {
      throw new Error('Укажите от 1 до 4 скрытых слоёв по 1–256 нейронов');
    }
    const seed = this.integer('trainingSeed', 1, 2_000_000_000);
    config.populationSize = this.integer('trainingPopulation', 4, 256);
    config.generations = this.integer('trainingGenerations', 1, 1000);
    config.eliteCount = this.integer('trainingElite', 1, config.populationSize - 1);
    config.tournamentSize = this.integer('trainingTournament', 2, config.populationSize);
    config.crossoverRate = this.decimal('trainingCrossover', 0, 1);
    config.mutationRate = this.decimal('trainingMutationRate', 0, 1);
    config.mutationSigma = this.decimal('trainingMutationSigma', 0.0001, 10);
    config.topology = [inputSize, ...hiddenLayers, 3];
    config.trainingSeeds = [seed, seed + 1, seed + 2];
    config.validationSeeds = [seed + 101, seed + 103, seed + 107, seed + 109, seed + 113];
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
      throw new Error('Хотя бы один сценарий должен иметь ненулевой вес');
    }
    return config;
  }

  private renderGeneration(report: GenerationReport, totalGenerations: number): void {
    this.setStatus(
      `Поколение ${report.generation}/${totalGenerations}; лучший fitness ${format(report.bestFitness)}`,
    );
    const row = document.createElement('tr');
    [
      report.generation,
      format(report.bestFitness),
      format(report.meanFitness),
      format(report.medianFitness),
      report.validationFitness === undefined ? '—' : format(report.validationFitness),
      format(report.bestMetrics.averageScore),
      format(report.bestMetrics.averageSurvivedTicks),
      `${format(report.bestMetrics.winRate * 100)}%`,
      format(report.diversity),
      `${format(report.simulationsPerSecond)} сим/с`,
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    this.element('trainingReportBody').appendChild(row);
    this.renderChart();
  }

  private renderChart(): void {
    const svg = this.element('trainingChart') as unknown as SVGSVGElement;
    while (svg.firstChild) svg.firstChild.remove();
    if (this.reports.length === 0) return;
    const width = 600;
    const height = 220;
    const values = this.reports.flatMap((report) => [
      report.bestFitness,
      report.meanFitness,
      report.medianFitness,
      ...(report.validationFitness === undefined ? [] : [report.validationFitness]),
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    this.addChartLine(svg, this.reports.map((report) => report.bestFitness), 'training-chart-best', width, height, min, range);
    this.addChartLine(svg, this.reports.map((report) => report.meanFitness), 'training-chart-mean', width, height, min, range);
    this.addChartLine(svg, this.reports.map((report) => report.medianFitness), 'training-chart-median', width, height, min, range);
    const validationPoints = this.reports
      .map((report, index) => ({ index, value: report.validationFitness }))
      .filter((item): item is { index: number; value: number } => item.value !== undefined);
    for (const point of validationPoints) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'training-chart-validation');
      circle.setAttribute('cx', String(scaleX(point.index, this.reports.length, width)));
      circle.setAttribute('cy', String(scaleY(point.value, min, range, height)));
      circle.setAttribute('r', '4');
      svg.appendChild(circle);
    }
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
    this.replay?.stop();
    const speed = Number(this.select('trainingReplaySpeed').value) as ArenaSpeedMultiplier;
    const network = createDenseNetworkFromGenome(model.topology, new Float32Array(model.genome));
    this.replay = createArenaDemoController({
      canvas: this.options.canvas,
      participants: [{
        name: 'Чемпион',
        algorithm: createNeuralArenaAlgorithm({ id: model.id, network }),
      }],
      level: model.trainingConfig.level,
      difficultyLevel: model.trainingConfig.difficultyLevel,
      speedMultiplier: speed,
      seed: model.trainingConfig.validationSeeds[0],
      fitToViewport: true,
    });
    this.replay.start();
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
    if (models.length === 0) {
      container.textContent = 'Сохранённых моделей пока нет.';
      return;
    }
    for (const model of models) {
      const row = document.createElement('div');
      row.className = 'training-model-row';
      const label = document.createElement('span');
      label.className = 'training-model-name';
      label.textContent = `${model.name} · ${format(model.trainingFitness)}`;
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
      row.append(label, replayButton, downloadButton);
      container.appendChild(row);
    }
  }

  private downloadModel(model: TrainedModelArtifact): void {
    this.downloadFile(`${model.id}.json`, JSON.stringify(model, null, 2), 'application/json');
  }

  private downloadCsv(): void {
    if (this.reports.length === 0) return;
    const header = [
      'generation', 'bestFitness', 'meanFitness', 'medianFitness', 'validationFitness',
      'averageScore', 'averageSurvivedTicks', 'winRate', 'aliveRate', 'diversity',
      'simulationsPerSecond',
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
      report.simulationsPerSecond,
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
    this.button('trainingCancel').disabled = !running;
    this.button('trainingSave').disabled = running || !this.result;
    this.button('trainingDownload').disabled = running || !this.result;
    this.button('trainingCsv').disabled = running || this.reports.length === 0;
  }

  private setStatus(text: string): void {
    this.element('trainingStatus').textContent = text;
  }

  private integer(id: string, min: number, max: number): number {
    const value = Number.parseInt(this.input(id).value, 10);
    if (!Number.isFinite(value)) throw new Error(`Поле ${id} должно быть целым числом`);
    return Math.max(min, Math.min(max, value));
  }

  private decimal(id: string, min: number, max: number): number {
    const value = Number.parseFloat(this.input(id).value);
    if (!Number.isFinite(value)) throw new Error(`Поле ${id} должно быть числом`);
    return Math.max(min, Math.min(max, value));
  }

  private setValue(id: string, value: string | number): void {
    (this.element(id) as HTMLInputElement | HTMLSelectElement).value = String(value);
  }

  private element(id: string): HTMLElement {
    const element = this.options.panel.querySelector<HTMLElement>(`#${id}`);
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

function scaleX(index: number, count: number, width: number): number {
  return 12 + index * (width - 24) / Math.max(1, count - 1);
}

function scaleY(value: number, min: number, range: number, height: number): number {
  return height - 12 - (value - min) / range * (height - 24);
}

const trainingLabMarkup = `
  <div class="dev-panel training-lab-panel">
    <h2 class="dev-panel-title">Генетическое обучение</h2>
    <p class="training-lab-about-text">Популяции нейросетей обучаются в отдельном Web Worker. На Canvas показывается validation replay чемпиона.</p>
    <div class="dev-section training-config-grid">
      <div class="dev-section-title">Популяция и сеть</div>
      <label class="dev-row"><span class="dev-row-label">Поколения</span><input id="trainingGenerations" class="dev-input" type="number" min="1" max="1000"></label>
      <label class="dev-row"><span class="dev-row-label">Популяция</span><input id="trainingPopulation" class="dev-input" type="number" min="4" max="256"></label>
      <label class="dev-row"><span class="dev-row-label">Элита</span><input id="trainingElite" class="dev-input" type="number" min="1"></label>
      <label class="dev-row"><span class="dev-row-label">Турнир</span><input id="trainingTournament" class="dev-input" type="number" min="2"></label>
      <label class="dev-row"><span class="dev-row-label">Скрытые слои</span><input id="trainingHiddenLayers" class="dev-input" type="text" placeholder="32,16"></label>
      <label class="dev-row"><span class="dev-row-label">Скрещивание</span><input id="trainingCrossover" class="dev-input" type="number" min="0" max="1" step="0.01"></label>
      <label class="dev-row"><span class="dev-row-label">Мутация</span><input id="trainingMutationRate" class="dev-input" type="number" min="0" max="1" step="0.01"></label>
      <label class="dev-row"><span class="dev-row-label">Сила мутации</span><input id="trainingMutationSigma" class="dev-input" type="number" min="0.0001" step="0.01"></label>
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
    <div class="dev-buttons training-lab-actions">
      <button id="trainingStart" type="button" class="btn btn-primary btn-small">Начать обучение</button>
      <button id="trainingCancel" type="button" class="btn btn-secondary btn-small" disabled>Отменить</button>
      <button id="trainingSave" type="button" class="btn btn-secondary btn-small" disabled>Сохранить</button>
      <button id="trainingDownload" type="button" class="btn btn-secondary btn-small" disabled>Скачать</button>
      <button id="trainingCsv" type="button" class="btn btn-secondary btn-small" disabled>CSV отчёт</button>
      <button id="trainingImport" type="button" class="btn btn-secondary btn-small">Импорт</button>
      <input id="trainingFile" class="training-file-input" type="file" accept="application/json,.json">
      <button id="trainingMenu" type="button" class="btn btn-secondary btn-small">Меню</button>
    </div>
    <div id="trainingStatus" class="training-status" aria-live="polite">Настройте параметры и начните обучение.</div>
    <div class="dev-section">
      <div class="dev-section-title">График fitness</div>
      <div class="training-chart-legend"><span class="training-legend-best">Лучший</span><span class="training-legend-mean">Средний</span><span class="training-legend-median">Медиана</span><span class="training-legend-validation">Validation</span></div>
      <svg id="trainingChart" class="training-chart" viewBox="0 0 600 220" role="img" aria-label="График fitness по поколениям"></svg>
    </div>
    <div class="dev-section training-report-wrap">
      <div class="dev-section-title">Поколения</div>
      <table class="training-report-table"><thead><tr><th>№</th><th>Best</th><th>Mean</th><th>Median</th><th>Validation</th><th>Score</th><th>Тики</th><th>Победы</th><th>Разнообразие</th><th>Скорость</th></tr></thead><tbody id="trainingReportBody"></tbody></table>
    </div>
    <div class="dev-section"><div class="dev-section-title">Итоги чемпиона</div><div id="trainingSummary" class="training-summary">Обучение ещё не завершено.</div></div>
    <div class="dev-section">
      <div class="dev-section-title">Validation replay</div>
      <label class="dev-row"><span class="dev-row-label">Скорость</span><select id="trainingReplaySpeed" class="dev-input"><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option><option value="16">16x</option><option value="100">100x</option><option value="1000">1000x</option></select></label>
    </div>
    <div class="dev-section"><div class="dev-section-title">Сохранённые модели</div><div id="trainingModels" class="training-models"></div></div>
  </div>
`;
