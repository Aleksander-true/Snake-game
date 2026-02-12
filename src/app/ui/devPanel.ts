import { gameSettings, GameSettings, resetSettings, createDefaultSettings } from '../../engine/settings';

/** Field definition for the dev panel. */
interface FieldDef {
  key: keyof GameSettings;
  label: string;
  type: 'number' | 'color';
  step?: number;
}

const FIELDS: FieldDef[] = [
  /* Snake */
  { key: 'hungerThreshold',          label: 'Тики голода',            type: 'number' },
  { key: 'initialSnakeLength',       label: 'Нач. длина змейки',     type: 'number' },
  { key: 'minSnakeLength',           label: 'Мин. длина (смерть)',   type: 'number' },

  /* Rabbits */
  { key: 'reproductionMinTick',      label: 'Мин. тик размножения',  type: 'number' },
  { key: 'reproductionMaxTick',      label: 'Макс. тик размножения', type: 'number' },
  { key: 'reproductionProbabilityBase', label: 'Базовая вероятность', type: 'number', step: 0.01 },
  { key: 'maxReproductions',         label: 'Макс. потомство',       type: 'number' },
  { key: 'neighborReproductionRadius', label: 'Радиус соседей',      type: 'number' },
  { key: 'maxReproductionNeighbors', label: 'Макс. соседей (блок)',  type: 'number' },
  { key: 'neighborReproductionPenalty', label: 'Штраф за соседа',    type: 'number', step: 0.05 },

  /* Board */
  { key: 'levelTimeLimit',           label: 'Время уровня (сек)',    type: 'number' },
  { key: 'tickIntervalMs',           label: 'Интервал тика (мс)',    type: 'number' },

  /* Colors */
  { key: 'colorBg',                  label: 'Цвет фона',             type: 'color' },
  { key: 'colorGrid',                label: 'Цвет сетки',            type: 'color' },
  { key: 'colorWall',                label: 'Цвет стен',             type: 'color' },
  { key: 'colorRabbit',              label: 'Цвет кроликов',         type: 'color' },
  { key: 'colorHeadStroke',          label: 'Обводка головы',        type: 'color' },
];

/**
 * Render the dev settings panel.
 * @param onApply called when user clicks "Применить" — receives chosen level.
 */
export function renderDevPanel(
  container: HTMLElement,
  currentLevel: number,
  onApply: (level: number) => void
): void {
  let html = `
    <div class="dev-panel">
      <h3 class="dev-panel-title">⚙ Настройки (dev)</h3>
      <div class="dev-panel-scroll">
        <div class="dev-grid">
  `;

  /* Level selector */
  html += `
    <span class="dev-label">Уровень:</span>
    <input type="number" id="dev-level" min="1" max="99" value="${currentLevel}"
      class="dev-input dev-input-num">
  `;

  /* Wall overrides per selected level */
  html += `
    <span class="dev-label">Кластеров стен:</span>
    <input type="number" id="dev-wallClusters" min="0" value="${getWallClusters(currentLevel)}"
      class="dev-input dev-input-num">
    <span class="dev-label">Длина стен:</span>
    <input type="number" id="dev-wallLength" min="1" value="${getWallLengthDefault()}"
      class="dev-input dev-input-num">
  `;

  for (const f of FIELDS) {
    const val = gameSettings[f.key];
    if (f.type === 'color') {
      html += `
        <span class="dev-label">${f.label}:</span>
        <input type="color" id="dev-${f.key}" value="${val}" class="dev-input dev-input-color">
      `;
    } else {
      const step = f.step ?? 1;
      html += `
        <span class="dev-label">${f.label}:</span>
        <input type="number" id="dev-${f.key}" value="${val}" step="${step}"
          class="dev-input dev-input-num">
      `;
    }
  }

  /* Snake colors */
  html += `<span class="dev-label dev-label-wide">Цвета змеек:</span>`;
  html += `<div></div>`; /* empty grid cell */
  for (let i = 0; i < gameSettings.snakeColors.length; i++) {
    html += `
      <span class="dev-label">Змейка ${i + 1}:</span>
      <input type="color" id="dev-snakeColor-${i}" value="${gameSettings.snakeColors[i]}"
        class="dev-input dev-input-color">
    `;
  }

  html += `
        </div>
      </div>
      <div class="dev-buttons">
        <button id="dev-apply" class="btn btn-primary btn-small">Применить</button>
        <button id="dev-reset" class="btn btn-secondary btn-small">Сброс</button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Apply button
  container.querySelector('#dev-apply')!.addEventListener('click', () => {
    // Read all fields into gameSettings
    for (const f of FIELDS) {
      const el = container.querySelector(`#dev-${f.key}`) as HTMLInputElement;
      if (!el) continue;
      if (f.type === 'color') {
        (gameSettings as any)[f.key] = el.value;
      } else {
        (gameSettings as any)[f.key] = parseFloat(el.value);
      }
    }
    // Snake colors
    for (let i = 0; i < gameSettings.snakeColors.length; i++) {
      const el = container.querySelector(`#dev-snakeColor-${i}`) as HTMLInputElement;
      if (el) gameSettings.snakeColors[i] = el.value;
    }
    // Wall overrides are stored on gameSettings as transient props
    const clustersEl = container.querySelector('#dev-wallClusters') as HTMLInputElement;
    const lengthEl = container.querySelector('#dev-wallLength') as HTMLInputElement;
    (gameSettings as any)._wallClustersOverride = parseInt(clustersEl.value, 10);
    (gameSettings as any)._wallLengthOverride = parseInt(lengthEl.value, 10);

    const level = parseInt((container.querySelector('#dev-level') as HTMLInputElement).value, 10) || 1;
    onApply(level);
  });

  // Reset button
  container.querySelector('#dev-reset')!.addEventListener('click', () => {
    resetSettings();
    delete (gameSettings as any)._wallClustersOverride;
    delete (gameSettings as any)._wallLengthOverride;
    renderDevPanel(container, currentLevel, onApply);
  });
}

function getWallClusters(level: number): number {
  if ((gameSettings as any)._wallClustersOverride != null) {
    return (gameSettings as any)._wallClustersOverride;
  }
  return Math.floor(level * 1.2 + 2);
}

function getWallLengthDefault(): number {
  if ((gameSettings as any)._wallLengthOverride != null) {
    return (gameSettings as any)._wallLengthOverride;
  }
  // Use a mid-range difficulty as sensible default for display
  return Math.floor(5 * 1.2 + 3);
}
