import {
  gameSettings, GameSettings, LevelOverride,
  resetSettings,
  saveSettingsToStorage, loadSettingsFromStorage, clearSettingsStorage,
  settingsToJSON, getLevelOverride, setLevelOverride,
} from '../../engine/settings';
import { getWallClusterCount, getWallLength, getInitialRabbitCount } from '../../engine/game';

/* ================================================================
 *  HTML template helpers
 * ================================================================ */

/** Section with a title and rows inside. */
function section(title: string, body: string): string {
  return `
    <div class="dev-section">
      <div class="dev-section-title">${title}</div>
      ${body}
    </div>`;
}

/** A single row: label on the left, input on the right. */
function row(label: string, input: string): string {
  return `
    <div class="dev-row">
      <span class="dev-row-label">${label}</span>
      ${input}
    </div>`;
}

/** Number input. */
function num(id: string, value: number | string, step = 1, min?: number): string {
  const minAttr = min != null ? ` min="${min}"` : '';
  return `<input type="number" id="${id}" value="${value}" step="${step}"${minAttr} class="dev-input dev-input-num">`;
}

/** Color picker input. */
function color(id: string, value: string): string {
  return `<input type="color" id="${id}" value="${value}" class="dev-input dev-input-color">`;
}

/** Shortcut: row with a number from gameSettings. */
function settingsRow(key: keyof GameSettings, label: string, step = 1): string {
  return row(label, num(`dev-${key}`, gameSettings[key] as number, step));
}

/** Shortcut: row with a color from gameSettings. */
function settingsColorRow(key: keyof GameSettings, label: string): string {
  return row(label, color(`dev-${key}`, gameSettings[key] as string));
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
  return section('🎮 Уровень',
    row('Уровень', num('dev-level', currentLevel, 1, 1))
  );
}

function buildLevelOverridesSection(currentLevel: number): string {
  const ov = getLevelOverride(currentLevel);
  const defWC = getWallClusterCount(currentLevel);
  const defWL = getWallLength(5);
  const defRC = getInitialRabbitCount(1, 5);

  return section(`📋 Уровень ${currentLevel}`,
    row('Кластеров стен',  num('dev-lvl-wallClusters', ov.wallClusters ?? defWC, 1, 0)) +
    row('Длина стен',       num('dev-lvl-wallLength',   ov.wallLength   ?? defWL, 1, 1)) +
    row('Кроликов (нач.)',  num('dev-lvl-rabbitCount',  ov.rabbitCount  ?? defRC, 1, 0))
  );
}

function buildSnakeSection(): string {
  return section('🐍 Змейка',
    settingsRow('hungerThreshold',    'Тики голода') +
    settingsRow('initialSnakeLength', 'Нач. длина') +
    settingsRow('minSnakeLength',     'Мин. длина (смерть)')
  );
}

function buildRabbitLifecycleSection(): string {
  return section('🐇 Жизненный цикл',
    settingsRow('rabbitYoungAge', 'Молодость до (тик)') +
    settingsRow('rabbitAdultAge', 'Взрослый до (тик)') +
    settingsRow('rabbitMaxAge',   'Смерть на тике')
  );
}

function buildRabbitSpawnSection(): string {
  return section('🐇 Спавн и размножение',
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
  return section('🐇 Генерация (формулы)',
    settingsRow('rabbitCountPerSnakeCoeff', 'Коэфф. на змейку', 0.1) +
    settingsRow('rabbitCountBase',          'Базовое кол-во')
  );
}

function buildWallsSection(): string {
  return section('🧱 Стены (формулы)',
    settingsRow('wallClusterCoeff',  'Коэфф. кластеров', 0.1) +
    settingsRow('wallClusterBase',   'Базовые кластеры')       +
    settingsRow('wallLengthCoeff',   'Коэфф. длины',     0.1) +
    settingsRow('wallLengthBase',    'Базовая длина')
  );
}

function buildScoringSection(): string {
  return section('🎯 Очки (формулы)',
    settingsRow('targetScoreCoeff', 'Коэфф. цели', 0.1) +
    settingsRow('targetScoreBase',  'Базовая цель')
  );
}

function buildBoardSection(): string {
  return section('📐 Поле',
    settingsRow('baseWidth',          'Ширина')            +
    settingsRow('baseHeight',         'Высота')            +
    settingsRow('levelSizeIncrement', 'Рост за уровень')   +
    settingsRow('levelTimeLimit',     'Время уровня (с)')  +
    settingsRow('tickIntervalMs',     'Интервал тика (мс)')
  );
}

function buildAiSection(): string {
  return section('🤖 ИИ / Зрение',
    settingsRow('visionSize',          'Размер обзора')           +
    settingsRow('obstacleSignalClose', 'Сигнал преп. (близко)')   +
    settingsRow('obstacleSignalDecay', 'Затухание преп.')          +
    settingsRow('rabbitSignalClose',   'Сигнал кролика (близко)') +
    settingsRow('rabbitSignalDecay',   'Затухание кролика')        +
    settingsRow('rabbitSignalMin',     'Мин. сигнал кролика')
  );
}

function buildColorsSection(): string {
  let snakeRows = '';
  for (let i = 0; i < gameSettings.snakeColors.length; i++) {
    snakeRows += row(`Змейка ${i + 1}`, color(`dev-snakeColor-${i}`, gameSettings.snakeColors[i]));
  }

  return section('🎨 Цвета',
    settingsColorRow('colorBg',          'Фон')             +
    settingsColorRow('colorGrid',        'Сетка')           +
    settingsColorRow('colorWall',        'Стены')           +
    settingsColorRow('colorRabbit',      'Взрослый кролик') +
    settingsColorRow('colorRabbitYoung', 'Молодой кролик')  +
    settingsColorRow('colorRabbitOld',   'Пожилой кролик')  +
    settingsColorRow('colorHeadStroke',  'Обводка головы')  +
    snakeRows
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
  onApply: (level: number) => void,
): void {
  loadSettingsFromStorage();

  const html = `
    <div class="dev-panel">
      <h3 class="dev-panel-title">⚙ Настройки (dev)</h3>
      <div class="dev-panel-scroll">
        ${buildLevelSection(currentLevel)}
        ${buildLevelOverridesSection(currentLevel)}
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
  bindEvents(container, currentLevel, onApply);
}

/* ================================================================
 *  Event binding
 * ================================================================ */

function bindEvents(
  container: HTMLElement,
  currentLevel: number,
  onApply: (level: number) => void,
): void {
  const levelInput = qs<HTMLInputElement>(container, '#dev-level');

  // Level change → re-render with new level's overrides
  levelInput.addEventListener('change', () => {
    readPanelIntoSettings(container);
    renderDevPanel(container, parseInt(levelInput.value, 10) || 1, onApply);
  });

  // Apply: read all → save → restart
  qs(container, '#dev-apply').addEventListener('click', () => {
    const level = readAndSave(container, levelInput);
    onApply(level);
  });

  // Save level overrides
  qs(container, '#dev-save-lvl').addEventListener('click', () => {
    readAndSave(container, levelInput);
    showToast(container, 'Уровень сохранён ✓');
  });

  // Export JSON
  qs(container, '#dev-export').addEventListener('click', () => {
    readAndSave(container, levelInput);
    exportJSON();
  });

  // Reset
  qs(container, '#dev-reset').addEventListener('click', () => {
    resetSettings();
    clearSettingsStorage();
    renderDevPanel(container, currentLevel, onApply);
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
  for (const f of ALL_FIELDS) {
    const el = container.querySelector(`#dev-${f.key}`) as HTMLInputElement | null;
    if (!el) continue;
    (gameSettings as any)[f.key] = f.type === 'color' ? el.value : parseFloat(el.value);
  }
  // Snake colors
  for (let i = 0; i < gameSettings.snakeColors.length; i++) {
    const el = container.querySelector(`#dev-snakeColor-${i}`) as HTMLInputElement | null;
    if (el) gameSettings.snakeColors[i] = el.value;
  }
}

/** Save per-level overrides from panel inputs. */
function saveLevelOverride(container: HTMLElement, level: number): void {
  const override: LevelOverride = {};
  const wc = container.querySelector('#dev-lvl-wallClusters') as HTMLInputElement | null;
  const wl = container.querySelector('#dev-lvl-wallLength') as HTMLInputElement | null;
  const rc = container.querySelector('#dev-lvl-rabbitCount') as HTMLInputElement | null;
  if (wc?.value) override.wallClusters = parseInt(wc.value, 10);
  if (wl?.value) override.wallLength   = parseInt(wl.value, 10);
  if (rc?.value) override.rabbitCount  = parseInt(rc.value, 10);
  setLevelOverride(level, override);
}

/* ================================================================
 *  Utilities
 * ================================================================ */

/** querySelector with type assertion. */
function qs<T extends HTMLElement = HTMLElement>(parent: HTMLElement, selector: string): T {
  return parent.querySelector(selector) as T;
}

/** Trigger browser download of all settings as JSON. */
function exportJSON(): void {
  const json = JSON.stringify(settingsToJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gameDefaults.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
