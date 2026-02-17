import {
  gameSettings, GameSettings, LevelOverride,
  resetSettings,
  settingsToJSON, getLevelOverride, setLevelOverride,
} from '../../../engine/settings';
import {
  saveSettingsToStorage, loadSettingsFromStorage, clearSettingsStorage,
} from '../../adapters/storageAdapter';
import { getWallClusterCount, getWallLength, getInitialRabbitCount } from '../../../engine/formulas';

export interface DevPanelSessionConfig {
  difficultyLevel: number;
  snakeCount: number;
}

/* ================================================================
 *  HTML template helpers
 * ================================================================ */

/** Section with a title and rows inside. */
function buildSection(title: string, body: string): string {
  return `
    <div class="dev-section">
      <div class="dev-section-title">${title}</div>
      ${body}
    </div>`;
}

/** A single row: label on the left, input on the right. */
function buildRow(label: string, input: string): string {
  return `
    <div class="dev-row">
      <span class="dev-row-label">${label}</span>
      ${input}
    </div>`;
}

/** Number input. */
function buildNumberInput(id: string, value: number | string, step = 1, min?: number): string {
  const minAttr = min != null ? ` min="${min}"` : '';
  return `<input type="number" id="${id}" value="${value}" step="${step}"${minAttr} class="dev-input dev-input-num">`;
}

/** Color picker input. */
function buildColorInput(id: string, value: string): string {
  return `<input type="color" id="${id}" value="${value}" class="dev-input dev-input-color">`;
}

/** Shortcut: row with a number from gameSettings. */
function settingsRow(key: keyof GameSettings, label: string, step = 1): string {
  return buildRow(label, buildNumberInput(`dev-${key}`, gameSettings[key] as number, step));
}

/** Shortcut: row with a color from gameSettings. */
function settingsColorRow(key: keyof GameSettings, label: string): string {
  return buildRow(label, buildColorInput(`dev-${key}`, gameSettings[key] as string));
}

/* ================================================================
 *  Field list (for read-back from DOM)
 * ================================================================ */

interface FieldDef {
  key: keyof GameSettings;
  type: 'number' | 'color';
}

const ALL_FIELDS: FieldDef[] = [
  // Snake
  { key: 'hungerThreshold',             type: 'number' },
  { key: 'initialSnakeLength',          type: 'number' },
  { key: 'minSnakeLength',              type: 'number' },
  // Rabbit lifecycle
  { key: 'rabbitYoungAge',              type: 'number' },
  { key: 'rabbitAdultAge',              type: 'number' },
  { key: 'rabbitMaxAge',                type: 'number' },
  // Rabbit spawning
  { key: 'rabbitMinDistance',            type: 'number' },
  // Rabbit reproduction
  { key: 'reproductionMinCooldown',     type: 'number' },
  { key: 'reproductionProbabilityBase', type: 'number' },
  { key: 'maxReproductions',            type: 'number' },
  { key: 'neighborReproductionRadius',  type: 'number' },
  { key: 'maxReproductionNeighbors',    type: 'number' },
  { key: 'neighborReproductionPenalty', type: 'number' },
  // Rabbit generation
  { key: 'rabbitCountPerSnakeCoeff',    type: 'number' },
  { key: 'rabbitCountBase',             type: 'number' },
  // Walls
  { key: 'wallClusterCoeff',            type: 'number' },
  { key: 'wallClusterBase',             type: 'number' },
  { key: 'wallLengthCoeff',             type: 'number' },
  { key: 'wallLengthBase',              type: 'number' },
  // Scoring
  { key: 'targetScoreCoeff',            type: 'number' },
  { key: 'targetScoreBase',             type: 'number' },
  // Board
  { key: 'baseWidth',                   type: 'number' },
  { key: 'baseHeight',                  type: 'number' },
  { key: 'levelSizeIncrement',          type: 'number' },
  { key: 'levelTimeLimit',              type: 'number' },
  { key: 'tickIntervalMs',              type: 'number' },
  // AI
  { key: 'visionSize',                  type: 'number' },
  { key: 'obstacleSignalClose',         type: 'number' },
  { key: 'obstacleSignalDecay',         type: 'number' },
  { key: 'rabbitSignalClose',           type: 'number' },
  { key: 'rabbitSignalDecay',           type: 'number' },
  { key: 'rabbitSignalMin',             type: 'number' },
  // Colors
  { key: 'colorBg',                     type: 'color' },
  { key: 'colorGrid',                   type: 'color' },
  { key: 'colorWall',                   type: 'color' },
  { key: 'colorRabbit',                 type: 'color' },
  { key: 'colorRabbitYoung',            type: 'color' },
  { key: 'colorRabbitOld',              type: 'color' },
  { key: 'colorHeadStroke',             type: 'color' },
];

/* ================================================================
 *  Section builders
 * ================================================================ */

function buildLevelSection(currentLevel: number): string {
  return buildSection('🎮 Уровень',
    buildRow('Уровень', buildNumberInput('dev-level', currentLevel, 1, 1))
  );
}

function buildLevelOverridesSection(currentLevel: number, sessionConfig: DevPanelSessionConfig): string {
  const levelOverride = getLevelOverride(currentLevel);
  const defaultWallClusters = getWallClusterCount(currentLevel, gameSettings);
  const defaultWallLength = getWallLength(sessionConfig.difficultyLevel, gameSettings);
  const defaultRabbitCount = getInitialRabbitCount(
    sessionConfig.snakeCount,
    sessionConfig.difficultyLevel,
    gameSettings
  );

  return buildSection(`📋 Уровень ${currentLevel}`,
    buildRow('Кластеров стен',  buildNumberInput('dev-lvl-wallClusters', levelOverride.wallClusters ?? defaultWallClusters, 1, 0)) +
    buildRow('Длина стен',       buildNumberInput('dev-lvl-wallLength',   levelOverride.wallLength   ?? defaultWallLength, 1, 1)) +
    buildRow('Кроликов (нач.)',  buildNumberInput('dev-lvl-rabbitCount',  levelOverride.rabbitCount  ?? defaultRabbitCount, 1, 0))
  );
}

function buildSnakeSection(): string {
  return buildSection('🐍 Змейка',
    settingsRow('hungerThreshold',    'Тики голода') +
    settingsRow('initialSnakeLength', 'Нач. длина') +
    settingsRow('minSnakeLength',     'Мин. длина (смерть)')
  );
}

function buildRabbitLifecycleSection(): string {
  return buildSection('🐇 Жизненный цикл',
    settingsRow('rabbitYoungAge', 'Молодость до (тик)') +
    settingsRow('rabbitAdultAge', 'Взрослый до (тик)') +
    settingsRow('rabbitMaxAge',   'Смерть на тике')
  );
}

function buildRabbitSpawnSection(): string {
  return buildSection('🐇 Спавн и размножение',
    settingsRow('rabbitMinDistance',            'Мин. дистанция')      +
    settingsRow('reproductionMinCooldown',     'Кулдаун размнож.')     +
    settingsRow('reproductionProbabilityBase', 'Вероятность',    0.01) +
    settingsRow('maxReproductions',            'Макс. потомство')      +
    settingsRow('neighborReproductionRadius',  'Радиус соседей')       +
    settingsRow('maxReproductionNeighbors',    'Макс. соседей')        +
    settingsRow('neighborReproductionPenalty', 'Штраф за соседа', 0.05)
  );
}

function buildRabbitGenSection(): string {
  return buildSection('🐇 Генерация (формулы)',
    settingsRow('rabbitCountPerSnakeCoeff', 'Коэфф. на змейку', 0.1) +
    settingsRow('rabbitCountBase',          'Базовое кол-во')
  );
}

function buildWallsSection(): string {
  return buildSection('🧱 Стены (формулы)',
    settingsRow('wallClusterCoeff',  'Коэфф. кластеров', 0.1) +
    settingsRow('wallClusterBase',   'Базовые кластеры')       +
    settingsRow('wallLengthCoeff',   'Коэфф. длины',     0.1) +
    settingsRow('wallLengthBase',    'Базовая длина')
  );
}

function buildScoringSection(): string {
  return buildSection('🎯 Очки (формулы)',
    settingsRow('targetScoreCoeff', 'Коэфф. цели', 0.1) +
    settingsRow('targetScoreBase',  'Базовая цель')
  );
}

function buildBoardSection(): string {
  return buildSection('📐 Поле',
    settingsRow('baseWidth',          'Ширина')            +
    settingsRow('baseHeight',         'Высота')            +
    settingsRow('levelSizeIncrement', 'Рост за уровень')   +
    settingsRow('levelTimeLimit',     'Время уровня (с)')  +
    settingsRow('tickIntervalMs',     'Интервал тика (мс)')
  );
}

function buildAiSection(): string {
  return buildSection('🤖 ИИ / Зрение',
    settingsRow('visionSize',          'Размер обзора')           +
    settingsRow('obstacleSignalClose', 'Сигнал преп. (близко)')   +
    settingsRow('obstacleSignalDecay', 'Затухание преп.')          +
    settingsRow('rabbitSignalClose',   'Сигнал кролика (близко)') +
    settingsRow('rabbitSignalDecay',   'Затухание кролика')        +
    settingsRow('rabbitSignalMin',     'Мин. сигнал кролика')
  );
}

function buildColorsSection(): string {
  let snakeColorRows = '';
  for (let snakeColorIndex = 0; snakeColorIndex < gameSettings.snakeColors.length; snakeColorIndex++) {
    snakeColorRows += buildRow(
      `Змейка ${snakeColorIndex + 1}`,
      buildColorInput(`dev-snakeColor-${snakeColorIndex}`, gameSettings.snakeColors[snakeColorIndex])
    );
  }

  return buildSection('🎨 Цвета',
    settingsColorRow('colorBg',          'Фон')             +
    settingsColorRow('colorGrid',        'Сетка')           +
    settingsColorRow('colorWall',        'Стены')           +
    settingsColorRow('colorRabbit',      'Взрослый кролик') +
    settingsColorRow('colorRabbitYoung', 'Молодой кролик')  +
    settingsColorRow('colorRabbitOld',   'Пожилой кролик')  +
    settingsColorRow('colorHeadStroke',  'Обводка головы')  +
    snakeColorRows
  );
}

function buildButtons(): string {
  return `
    <div class="dev-buttons">
      <button id="dev-apply" class="btn btn-primary btn-small" title="Применить и перезапустить">▶ Применить</button>
      <button id="dev-save-lvl" class="btn btn-secondary btn-small" title="Сохранить настройки уровня">💾 Сохр. ур.</button>
    </div>
    <div class="dev-buttons dev-buttons-row2">
      <button id="dev-export" class="btn btn-secondary btn-small" title="Скачать все параметры как JSON">📥 JSON</button>
      <button id="dev-reset" class="btn btn-secondary btn-small" title="Сброс к дефолтам">🔄 Сброс</button>
    </div>`;
}

/* ================================================================
 *  Main render
 * ================================================================ */

export function renderDevPanel(
  container: HTMLElement,
  currentLevel: number,
  sessionConfig: DevPanelSessionConfig,
  onApply: (level: number) => void,
): void {
  loadSettingsFromStorage();

  const html = `
    <div class="dev-panel">
      <h3 class="dev-panel-title">⚙ Настройки (dev)</h3>
      <div class="dev-panel-scroll">
        ${buildLevelSection(currentLevel)}
        ${buildLevelOverridesSection(currentLevel, sessionConfig)}
        ${buildSnakeSection()}
        ${buildRabbitLifecycleSection()}
        ${buildRabbitSpawnSection()}
        ${buildRabbitGenSection()}
        ${buildWallsSection()}
        ${buildScoringSection()}
        ${buildBoardSection()}
        ${buildAiSection()}
        ${buildColorsSection()}
      </div>
      ${buildButtons()}
    </div>`;

  container.innerHTML = html;

  /* ---- Event handlers ---- */
  bindPanelEvents(container, currentLevel, sessionConfig, onApply);
}

/* ================================================================
 *  Event binding
 * ================================================================ */

function bindPanelEvents(
  container: HTMLElement,
  currentLevel: number,
  sessionConfig: DevPanelSessionConfig,
  onApply: (level: number) => void,
): void {
  const levelInput = getElement<HTMLInputElement>(container, '#dev-level');

  // Level change → re-render with new level's overrides
  levelInput.addEventListener('change', () => {
    readPanelIntoSettings(container);
    renderDevPanel(container, parseInt(levelInput.value, 10) || 1, sessionConfig, onApply);
  });

  // Apply: read all → save → restart
  getElement(container, '#dev-apply').addEventListener('click', () => {
    const level = readAndSave(container, levelInput);
    onApply(level);
  });

  // Save level overrides
  getElement(container, '#dev-save-lvl').addEventListener('click', () => {
    readAndSave(container, levelInput);
    showToast(container, 'Уровень сохранён ✓');
  });

  // Export JSON
  getElement(container, '#dev-export').addEventListener('click', () => {
    readAndSave(container, levelInput);
    exportJSON();
  });

  // Reset
  getElement(container, '#dev-reset').addEventListener('click', () => {
    resetSettings();
    clearSettingsStorage();
    renderDevPanel(container, currentLevel, sessionConfig, onApply);
  });
}

/* ================================================================
 *  DOM ↔ gameSettings helpers
 * ================================================================ */

/** Read all inputs from the panel into gameSettings + save to localStorage. Returns chosen level. */
function readAndSave(container: HTMLElement, levelInput: HTMLInputElement): number {
  readPanelIntoSettings(container);
  const level = parseInt(levelInput.value, 10) || 1;
  saveLevelOverride(container, level);
  saveSettingsToStorage();
  return level;
}

/** Read all panel inputs into the gameSettings singleton. */
function readPanelIntoSettings(container: HTMLElement): void {
  for (const field of ALL_FIELDS) {
    const inputElement = container.querySelector(`#dev-${field.key}`) as HTMLInputElement | null;
    if (!inputElement) continue;
    (gameSettings as any)[field.key] = field.type === 'color' ? inputElement.value : parseFloat(inputElement.value);
  }
  // Snake colors
  for (let snakeColorIndex = 0; snakeColorIndex < gameSettings.snakeColors.length; snakeColorIndex++) {
    const colorInputElement = container.querySelector(`#dev-snakeColor-${snakeColorIndex}`) as HTMLInputElement | null;
    if (colorInputElement) gameSettings.snakeColors[snakeColorIndex] = colorInputElement.value;
  }
}

/** Save per-level overrides from panel inputs. */
function saveLevelOverride(container: HTMLElement, level: number): void {
  const override: LevelOverride = {};
  const wallClustersInput = container.querySelector('#dev-lvl-wallClusters') as HTMLInputElement | null;
  const wallLengthInput = container.querySelector('#dev-lvl-wallLength') as HTMLInputElement | null;
  const rabbitCountInput = container.querySelector('#dev-lvl-rabbitCount') as HTMLInputElement | null;
  if (wallClustersInput?.value) override.wallClusters = parseInt(wallClustersInput.value, 10);
  if (wallLengthInput?.value) override.wallLength   = parseInt(wallLengthInput.value, 10);
  if (rabbitCountInput?.value) override.rabbitCount  = parseInt(rabbitCountInput.value, 10);
  setLevelOverride(level, override);
}

/* ================================================================
 *  Utilities
 * ================================================================ */

/** querySelector with type assertion. */
function getElement<T extends HTMLElement = HTMLElement>(parent: HTMLElement, selector: string): T {
  return parent.querySelector(selector) as T;
}

/** Trigger browser download of all settings as JSON. */
function exportJSON(): void {
  const json = JSON.stringify(settingsToJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = blobUrl;
  downloadLink.download = 'gameDefaults.json';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(blobUrl);
}

/** Show a brief toast message inside the dev panel. */
function showToast(container: HTMLElement, message: string): void {
  container.querySelector('.dev-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'dev-toast';
  toast.textContent = message;
  container.querySelector('.dev-panel')?.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}
