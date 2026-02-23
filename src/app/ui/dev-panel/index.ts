import {
  BotProfileId,
  BotSkillProfileSettings,
  gameSettings, GameSettings, LevelOverride,
  resetSettings,
  settingsToJSON, getLevelOverride, setLevelOverride,
  getLevelSettingsOverride, setLevelSettingOverride, clearLevelSettingOverride,
} from '../../../engine/settings';
import {
  saveSettingsToStorage, loadSettingsFromStorage, clearSettingsStorage,
} from '../../adapters/storageAdapter';
import { getWallClusterCount, getWallLength, getInitialFoodCount } from '../../../engine/formulas';

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

function buildScopeCheckbox(key: string, checked: boolean): string {
  const checkedAttr = checked ? 'checked' : '';
  return `
    <label class="dev-scope-label">
      <input type="checkbox" id="dev-scope-${key}" ${checkedAttr}>
      <span>Для всех</span>
    </label>
  `;
}

/** Number input. */
function buildNumberInput(id: string, value: number | string, step = 1, min?: number, extraAttrs = ''): string {
  const minAttr = min != null ? ` min="${min}"` : '';
  return `<input type="number" id="${id}" value="${value}" step="${step}"${minAttr} ${extraAttrs} class="dev-input dev-input-num">`;
}

/** Color picker input. */
function buildColorInput(id: string, value: string): string {
  return `<input type="color" id="${id}" value="${value}" class="dev-input dev-input-color">`;
}

/** Shortcut: row with a number from gameSettings. */
function getLevelAwareValue(key: keyof GameSettings, currentLevel: number): number | string {
  const levelOverride = getLevelSettingsOverride(currentLevel);
  if (levelOverride[key as string] != null) {
    return levelOverride[key as string];
  }
  return gameSettings[key] as number | string;
}

function buildScopedRow(
  key: keyof GameSettings,
  label: string,
  input: string,
  currentLevel: number
): string {
  const levelOverride = getLevelSettingsOverride(currentLevel);
  const isGlobal = levelOverride[key as string] == null;
  return buildRow(label, `${input}${buildScopeCheckbox(key as string, isGlobal)}`);
}

function settingsRow(key: keyof GameSettings, label: string, currentLevel: number, step = 1): string {
  return buildScopedRow(
    key,
    label,
    buildNumberInput(`dev-${key}`, getLevelAwareValue(key, currentLevel), step),
    currentLevel
  );
}

/** Shortcut: row with a color from gameSettings. */
function settingsColorRow(key: keyof GameSettings, label: string, currentLevel: number): string {
  return buildScopedRow(
    key,
    label,
    buildColorInput(`dev-${key}`, getLevelAwareValue(key, currentLevel) as string),
    currentLevel
  );
}

/* ================================================================
 *  Field list (for read-back from DOM)
 * ================================================================ */

interface FieldDef {
  key: keyof GameSettings;
  type: 'number' | 'color';
}

interface BotFieldDef {
  key: keyof BotSkillProfileSettings;
  label: string;
  step?: number;
  min?: number;
}

const BOT_PROFILE_FIELDS: BotFieldDef[] = [
  { key: 'trapPenalty', label: 'Штраф тупика' },
  { key: 'fearWeight', label: 'Страх змей' },
  { key: 'foodWeight', label: 'Вес еды' },
  { key: 'longSnakeThreshold', label: 'Длинная с длины' },
  { key: 'longSnakeFoodPenalty', label: 'Снижение интереса к еде', step: 0.05, min: 0 },
  { key: 'mistakePeriod', label: 'Период ошибок', min: 0 },
  { key: 'badMoveBias', label: 'Сила ошибки', step: 0.05, min: 0 },
];

const ALL_FIELDS: FieldDef[] = [
  // Snake
  { key: 'hungerThreshold',             type: 'number' },
  { key: 'initialSnakeLength',          type: 'number' },
  { key: 'minSnakeLength',              type: 'number' },
  // Rabbit lifecycle
  { key: 'foodYoungAge',              type: 'number' },
  { key: 'foodAdultAge',              type: 'number' },
  { key: 'foodMaxAge',                type: 'number' },
  // Rabbit spawning
  { key: 'foodMinDistance',            type: 'number' },
  // Rabbit reproduction
  { key: 'reproductionMinCooldown',     type: 'number' },
  { key: 'reproductionProbabilityBase', type: 'number' },
  { key: 'maxReproductions',            type: 'number' },
  { key: 'neighborReproductionRadius',  type: 'number' },
  { key: 'maxReproductionNeighbors',    type: 'number' },
  { key: 'neighborReproductionPenalty', type: 'number' },
  // Rabbit generation
  { key: 'foodCountPerSnakeCoeff',    type: 'number' },
  { key: 'foodCountBase',             type: 'number' },
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
  { key: 'foodSignalClose',           type: 'number' },
  { key: 'foodSignalDecay',           type: 'number' },
  { key: 'foodSignalMin',             type: 'number' },
  // Colors
  { key: 'colorBg',                     type: 'color' },
  { key: 'colorGrid',                   type: 'color' },
  { key: 'colorWall',                   type: 'color' },
  { key: 'colorFoodAdult',                 type: 'color' },
  { key: 'colorFoodYoung',            type: 'color' },
  { key: 'colorFoodOld',              type: 'color' },
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
  const defaultFoodCount = getInitialFoodCount(
    sessionConfig.snakeCount,
    sessionConfig.difficultyLevel,
    gameSettings
  );
  const hasWallClustersOverride = levelOverride.wallClusters != null;
  const hasWallLengthOverride = levelOverride.wallLength != null;
  const hasFoodCountOverride = levelOverride.foodCount != null;

  return buildSection(`📋 Уровень ${currentLevel}`,
    buildRow(
      'Кластеров стен',
      buildNumberInput(
        'dev-lvl-wallClusters',
        levelOverride.wallClusters ?? defaultWallClusters,
        1,
        0,
        `data-default="${defaultWallClusters}" data-had-override="${hasWallClustersOverride ? '1' : '0'}"`
      )
    ) +
    buildRow(
      'Длина стен',
      buildNumberInput(
        'dev-lvl-wallLength',
        levelOverride.wallLength ?? defaultWallLength,
        1,
        1,
        `data-default="${defaultWallLength}" data-had-override="${hasWallLengthOverride ? '1' : '0'}"`
      )
    ) +
    buildRow(
      'Еды (нач.)',
      buildNumberInput(
        'dev-lvl-foodCount',
        levelOverride.foodCount ?? defaultFoodCount,
        1,
        0,
        `data-default="${defaultFoodCount}" data-had-override="${hasFoodCountOverride ? '1' : '0'}"`
      )
    )
  );
}

function buildSnakeSection(currentLevel: number): string {
  return buildSection('🐍 Змейка',
    settingsRow('hungerThreshold',    'Тики голода', currentLevel) +
    settingsRow('initialSnakeLength', 'Нач. длина', currentLevel) +
    settingsRow('minSnakeLength',     'Мин. длина (смерть)', currentLevel)
  );
}

function buildRabbitLifecycleSection(currentLevel: number): string {
  return buildSection('🍎 Жизненный цикл еды',
    settingsRow('foodYoungAge', 'Молодость до (тик)', currentLevel) +
    settingsRow('foodAdultAge', 'Взрослый до (тик)', currentLevel) +
    settingsRow('foodMaxAge',   'Смерть на тике', currentLevel)
  );
}

function buildRabbitSpawnSection(currentLevel: number): string {
  return buildSection('🍎 Спавн и размножение еды',
    settingsRow('foodMinDistance',            'Мин. дистанция', currentLevel)      +
    settingsRow('reproductionMinCooldown',     'Кулдаун размнож.', currentLevel)     +
    settingsRow('reproductionProbabilityBase', 'Вероятность', currentLevel, 0.01) +
    settingsRow('maxReproductions',            'Макс. потомство', currentLevel)      +
    settingsRow('neighborReproductionRadius',  'Радиус соседей', currentLevel)       +
    settingsRow('maxReproductionNeighbors',    'Макс. соседей', currentLevel)        +
    settingsRow('neighborReproductionPenalty', 'Штраф за соседа', currentLevel, 0.05)
  );
}

function buildRabbitGenSection(currentLevel: number): string {
  return buildSection('🍎 Генерация еды (формулы)',
    settingsRow('foodCountPerSnakeCoeff', 'Коэфф. на змейку', currentLevel, 0.1) +
    settingsRow('foodCountBase',          'Базовое кол-во', currentLevel)
  );
}

function buildWallsSection(currentLevel: number): string {
  return buildSection('🧱 Стены (формулы)',
    settingsRow('wallClusterCoeff',  'Коэфф. кластеров', currentLevel, 0.1) +
    settingsRow('wallClusterBase',   'Базовые кластеры', currentLevel)       +
    settingsRow('wallLengthCoeff',   'Коэфф. длины', currentLevel, 0.1) +
    settingsRow('wallLengthBase',    'Базовая длина', currentLevel)
  );
}

function buildScoringSection(currentLevel: number): string {
  return buildSection('🎯 Очки (формулы)',
    settingsRow('targetScoreCoeff', 'Коэфф. цели', currentLevel, 0.1) +
    settingsRow('targetScoreBase',  'Базовая цель', currentLevel)
  );
}

function buildBoardSection(currentLevel: number): string {
  return buildSection('📐 Поле',
    settingsRow('baseWidth',          'Ширина', currentLevel)            +
    settingsRow('baseHeight',         'Высота', currentLevel)            +
    settingsRow('levelSizeIncrement', 'Рост за уровень', currentLevel)   +
    settingsRow('levelTimeLimit',     'Время уровня (с)', currentLevel)  +
    settingsRow('tickIntervalMs',     'Интервал тика (мс)', currentLevel)
  );
}

function buildAiSection(currentLevel: number): string {
  return buildSection('🤖 ИИ / Зрение',
    settingsRow('visionSize',          'Размер обзора', currentLevel)           +
    settingsRow('obstacleSignalClose', 'Сигнал преп. (близко)', currentLevel)   +
    settingsRow('obstacleSignalDecay', 'Затухание преп.', currentLevel)          +
    settingsRow('foodSignalClose',   'Сигнал еды (близко)', currentLevel) +
    settingsRow('foodSignalDecay',   'Затухание еды', currentLevel)        +
    settingsRow('foodSignalMin',     'Мин. сигнал еды', currentLevel)
  );
}

function buildBotProfilesSection(): string {
  const profileNames: Record<BotProfileId, string> = {
    rookie: 'Rookie (1-3)',
    basic: 'Basic (4-6)',
    solid: 'Solid (7-8)',
    wise: 'Wise (9-10)',
  };

  let body = '';
  const profileIds: BotProfileId[] = ['rookie', 'basic', 'solid', 'wise'];
  for (const profileId of profileIds) {
    body += `<div class="dev-section-title">${profileNames[profileId]}</div>`;
    for (const field of BOT_PROFILE_FIELDS) {
      const inputId = `dev-bot-${profileId}-${field.key}`;
      const value = gameSettings.botProfiles[profileId][field.key];
      body += buildRow(
        field.label,
        buildNumberInput(inputId, value, field.step ?? 1, field.min)
      );
    }
  }

  return buildSection('🧠 Профили ИИ', body);
}

function buildColorsSection(currentLevel: number): string {
  let snakeColorRows = '';
  for (let snakeColorIndex = 0; snakeColorIndex < gameSettings.snakeColors.length; snakeColorIndex++) {
    snakeColorRows += buildRow(
      `Змейка ${snakeColorIndex + 1}`,
      buildColorInput(`dev-snakeColor-${snakeColorIndex}`, gameSettings.snakeColors[snakeColorIndex])
    );
  }

  return buildSection('🎨 Цвета',
    settingsColorRow('colorBg',          'Фон', currentLevel)             +
    settingsColorRow('colorGrid',        'Сетка', currentLevel)           +
    settingsColorRow('colorWall',        'Стены', currentLevel)           +
    settingsColorRow('colorFoodAdult',      'Еда (взрослая)', currentLevel) +
    settingsColorRow('colorFoodYoung', 'Еда (молодая)', currentLevel)  +
    settingsColorRow('colorFoodOld',   'Еда (старая)', currentLevel)  +
    settingsColorRow('colorHeadStroke',  'Обводка головы', currentLevel)  +
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
        ${buildSnakeSection(currentLevel)}
        ${buildRabbitLifecycleSection(currentLevel)}
        ${buildRabbitSpawnSection(currentLevel)}
        ${buildRabbitGenSection(currentLevel)}
        ${buildWallsSection(currentLevel)}
        ${buildScoringSection(currentLevel)}
        ${buildBoardSection(currentLevel)}
        ${buildAiSection(currentLevel)}
        ${buildBotProfilesSection()}
        ${buildColorsSection(currentLevel)}
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
    readPanelIntoSettings(container, currentLevel);
    renderDevPanel(container, parseInt(levelInput.value, 10) || 1, sessionConfig, onApply);
  });

  // Apply: read all → save → restart
  getElement(container, '#dev-apply').addEventListener('click', () => {
    const level = readAndSave(container, levelInput, sessionConfig);
    onApply(level);
  });

  // Save level overrides
  getElement(container, '#dev-save-lvl').addEventListener('click', () => {
    readAndSave(container, levelInput, sessionConfig);
    showToast(container, 'Уровень сохранён ✓');
  });

  // Export JSON
  getElement(container, '#dev-export').addEventListener('click', () => {
    readAndSave(container, levelInput, sessionConfig);
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
function readAndSave(
  container: HTMLElement,
  levelInput: HTMLInputElement,
  sessionConfig: DevPanelSessionConfig
): number {
  const level = parseInt(levelInput.value, 10) || 1;
  readPanelIntoSettings(container, level);
  saveLevelOverride(container, level, sessionConfig);
  saveSettingsToStorage();
  return level;
}

/** Read all panel inputs into the gameSettings singleton. */
function readPanelIntoSettings(container: HTMLElement, level: number): void {
  for (const field of ALL_FIELDS) {
    const inputElement = container.querySelector(`#dev-${field.key}`) as HTMLInputElement | null;
    if (!inputElement) continue;
    const rawValue = field.type === 'color' ? inputElement.value : parseFloat(inputElement.value);
    const scopeCheckbox = container.querySelector(`#dev-scope-${field.key}`) as HTMLInputElement | null;
    const isGlobalScope = scopeCheckbox ? scopeCheckbox.checked : true;

    // Scope checkboxes exist for all fields except snake palette colors.
    gameSettings.fieldScopes[field.key as string] = isGlobalScope;
    if (isGlobalScope) {
      (gameSettings as any)[field.key] = rawValue;
      clearLevelSettingOverride(level, field.key as string);
    } else {
      setLevelSettingOverride(level, field.key as string, rawValue);
    }
  }
  // Snake colors
  for (let snakeColorIndex = 0; snakeColorIndex < gameSettings.snakeColors.length; snakeColorIndex++) {
    const colorInputElement = container.querySelector(`#dev-snakeColor-${snakeColorIndex}`) as HTMLInputElement | null;
    if (colorInputElement) gameSettings.snakeColors[snakeColorIndex] = colorInputElement.value;
  }

  readBotProfilesIntoSettings(container);
}

/** Save per-level overrides from panel inputs. */
function saveLevelOverride(container: HTMLElement, level: number, sessionConfig: DevPanelSessionConfig): void {
  void sessionConfig;
  const override: LevelOverride = {};
  const wallClustersInput = container.querySelector('#dev-lvl-wallClusters') as HTMLInputElement | null;
  const wallLengthInput = container.querySelector('#dev-lvl-wallLength') as HTMLInputElement | null;
  const foodCountInput = container.querySelector('#dev-lvl-foodCount') as HTMLInputElement | null;
  saveSingleLevelOverride(wallClustersInput, 'wallClusters', override);
  saveSingleLevelOverride(wallLengthInput, 'wallLength', override);
  saveSingleLevelOverride(foodCountInput, 'foodCount', override);

  setLevelOverride(level, override);
}

function saveSingleLevelOverride(
  input: HTMLInputElement | null,
  key: 'wallClusters' | 'wallLength' | 'foodCount',
  target: LevelOverride
): void {
  if (!input?.value) return;
  const currentValue = parseInt(input.value, 10);
  const defaultValue = parseInt(input.dataset.default || '', 10);
  if (Number.isNaN(defaultValue) || currentValue !== defaultValue) {
    (target as any)[key] = currentValue;
  }
}

function readBotProfilesIntoSettings(container: HTMLElement): void {
  const profileIds: BotProfileId[] = ['rookie', 'basic', 'solid', 'wise'];
  for (const profileId of profileIds) {
    for (const field of BOT_PROFILE_FIELDS) {
      const input = container.querySelector(`#dev-bot-${profileId}-${field.key}`) as HTMLInputElement | null;
      if (!input) continue;
      const rawValue = parseFloat(input.value);
      if (!Number.isFinite(rawValue)) continue;
      gameSettings.botProfiles[profileId][field.key] = rawValue;
    }
  }
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
