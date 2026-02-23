/**
 * Runtime game settings — the single source of truth for ALL game parameters.
 * Default values are loaded from gameDefaults.json.
 * The dev panel can override any field at runtime.
 * All game systems read from the `gameSettings` singleton.
 */
import defaults from './gameDefaults.json';

/* ====== Per-level overrides ====== */

export interface LevelOverride {
  wallClusters?: number;
  wallLength?: number;
  foodCount?: number;
  rabbitCount?: number;
}

export type LevelSettingsOverride = Record<string, number | string>;

/* ====== Main settings interface ====== */

export interface GameSettings {
  /* Snake */
  hungerThreshold: number;
  minSnakeLength: number;
  initialSnakeLength: number;

  /* Food — lifecycle */
  foodYoungAge: number;
  foodAdultAge: number;
  foodMaxAge: number;

  /* Food — spawning */
  foodMinDistance: number;

  /* Food — reproduction */
  reproductionMinCooldown: number;
  reproductionProbabilityBase: number;
  maxReproductions: number;
  neighborReproductionRadius: number;
  neighborReproductionPenalty: number;
  maxReproductionNeighbors: number;

  /* Food — generation formula */
  foodCountPerSnakeCoeff: number;
  foodCountBase: number;

  /* Walls — generation formulas */
  wallClusterCoeff: number;
  wallClusterBase: number;
  wallLengthCoeff: number;
  wallLengthBase: number;

  /* Scoring — target formula */
  targetScoreCoeff: number;
  targetScoreBase: number;

  /* Board / levels */
  baseWidth: number;
  baseHeight: number;
  levelSizeIncrement: number;
  levelTimeLimit: number;
  tickIntervalMs: number;

  /* AI / Vision */
  visionSize: number;
  obstacleSignalClose: number;
  obstacleSignalDecay: number;
  foodSignalClose: number;
  foodSignalDecay: number;
  foodSignalMin: number;

  /* Colors (canvas) */
  colorBg: string;
  colorGrid: string;
  colorWall: string;
  colorFoodAdult: string;
  colorFoodYoung: string;
  colorFoodOld: string;
  colorHeadStroke: string;
  snakeColors: string[];

  /* Per-level overrides (keyed by level number as string) */
  levelOverrides: Record<string, LevelOverride>;
  levelSettingsOverrides: Record<string, LevelSettingsOverride>;
  fieldScopes: Record<string, boolean>;

  // Deprecated compatibility aliases (tests/legacy modules)
  rabbitYoungAge: number;
  rabbitAdultAge: number;
  rabbitMaxAge: number;
  rabbitMinDistance: number;
  rabbitCountPerSnakeCoeff: number;
  rabbitCountBase: number;
  rabbitSignalClose: number;
  rabbitSignalDecay: number;
  rabbitSignalMin: number;
  colorRabbit: string;
  colorRabbitYoung: string;
  colorRabbitOld: string;
}

/* ====== Build defaults from JSON ====== */

export function createDefaultSettings(): GameSettings {
  const defaultJson = defaults;
  const fieldScopes = createDefaultFieldScopes();
  const settings = {
    hungerThreshold:              defaultJson.snake.hungerThreshold,
    minSnakeLength:               defaultJson.snake.minSnakeLength,
    initialSnakeLength:           defaultJson.snake.initialSnakeLength,

    foodYoungAge:               defaultJson.food.youngAge,
    foodAdultAge:               defaultJson.food.adultAge,
    foodMaxAge:                 defaultJson.food.maxAge,
    foodMinDistance:            defaultJson.food.minDistance,
    reproductionMinCooldown:    defaultJson.food.reproductionMinCooldown,
    reproductionProbabilityBase: defaultJson.food.reproductionProbabilityBase,
    maxReproductions:           defaultJson.food.maxReproductions,
    neighborReproductionRadius: defaultJson.food.neighborReproductionRadius,
    neighborReproductionPenalty: defaultJson.food.neighborReproductionPenalty,
    maxReproductionNeighbors:   defaultJson.food.maxReproductionNeighbors,
    foodCountPerSnakeCoeff:     defaultJson.food.countPerSnakeCoeff,
    foodCountBase:              defaultJson.food.countBase,

    wallClusterCoeff:             defaultJson.walls.clusterCoeff,
    wallClusterBase:              defaultJson.walls.clusterBase,
    wallLengthCoeff:              defaultJson.walls.lengthCoeff,
    wallLengthBase:               defaultJson.walls.lengthBase,

    targetScoreCoeff:             defaultJson.scoring.targetScoreCoeff,
    targetScoreBase:              defaultJson.scoring.targetScoreBase,

    baseWidth:                    defaultJson.board.baseWidth,
    baseHeight:                   defaultJson.board.baseHeight,
    levelSizeIncrement:           defaultJson.board.levelSizeIncrement,
    levelTimeLimit:               defaultJson.board.levelTimeLimit,
    tickIntervalMs:               defaultJson.board.tickIntervalMs,

    visionSize:                   defaultJson.ai.visionSize,
    obstacleSignalClose:          defaultJson.ai.obstacleSignalClose,
    obstacleSignalDecay:          defaultJson.ai.obstacleSignalDecay,
    foodSignalClose:            defaultJson.ai.foodSignalClose,
    foodSignalDecay:            defaultJson.ai.foodSignalDecay,
    foodSignalMin:              defaultJson.ai.foodSignalMin,

    colorBg:                      defaultJson.colors.bg,
    colorGrid:                    defaultJson.colors.grid,
    colorWall:                    defaultJson.colors.wall,
    colorFoodAdult:             defaultJson.colors.foodAdult,
    colorFoodYoung:             defaultJson.colors.foodYoung,
    colorFoodOld:               defaultJson.colors.foodOld,
    colorHeadStroke:              defaultJson.colors.headStroke,
    snakeColors:                  [...defaultJson.colors.snakeColors],

    levelOverrides:               { ...(defaultJson.levelOverrides as Record<string, LevelOverride>) },
    levelSettingsOverrides:       {},
    fieldScopes,
  } as unknown as GameSettings;

  defineLegacyAliases(settings);
  return settings;
}

/** The singleton mutable settings object. */
export const gameSettings: GameSettings = createDefaultSettings();

/** Reset all settings to defaults (from JSON). */
export function resetSettings(): void {
  Object.assign(gameSettings, createDefaultSettings());
}

/* ====== JSON export/import helpers ====== */

/** Type matching the structure of gameDefaults.json. */
export interface GameDefaultsJSON {
  snake: {
    hungerThreshold: number;
    minSnakeLength: number;
    initialSnakeLength: number;
  };
  food: {
    youngAge: number;
    adultAge: number;
    maxAge: number;
    minDistance: number;
    reproductionMinCooldown: number;
    reproductionProbabilityBase: number;
    maxReproductions: number;
    neighborReproductionRadius: number;
    neighborReproductionPenalty: number;
    maxReproductionNeighbors: number;
    countPerSnakeCoeff: number;
    countBase: number;
  };
  walls: {
    clusterCoeff: number;
    clusterBase: number;
    lengthCoeff: number;
    lengthBase: number;
  };
  scoring: {
    targetScoreCoeff: number;
    targetScoreBase: number;
  };
  board: {
    baseWidth: number;
    baseHeight: number;
    levelSizeIncrement: number;
    levelTimeLimit: number;
    tickIntervalMs: number;
  };
  ai: {
    visionSize: number;
    obstacleSignalClose: number;
    obstacleSignalDecay: number;
    foodSignalClose: number;
    foodSignalDecay: number;
    foodSignalMin: number;
  };
  colors: {
    bg: string;
    grid: string;
    wall: string;
    foodAdult: string;
    foodYoung: string;
    foodOld: string;
    headStroke: string;
    snakeColors: string[];
  };
  levelOverrides: Record<string, LevelOverride>;
  levelSettingsOverrides?: Record<string, LevelSettingsOverride>;
  fieldScopes?: Record<string, boolean>;
}

/**
 * Convert current gameSettings to a structured JSON object
 * matching the format of gameDefaults.json — always ALL fields.
 */
export function settingsToJSON(): GameDefaultsJSON {
  const settings = gameSettings;
  return {
    snake: {
      hungerThreshold: settings.hungerThreshold,
      minSnakeLength: settings.minSnakeLength,
      initialSnakeLength: settings.initialSnakeLength,
    },
    food: {
      youngAge: settings.foodYoungAge,
      adultAge: settings.foodAdultAge,
      maxAge: settings.foodMaxAge,
      minDistance: settings.foodMinDistance,
      reproductionMinCooldown: settings.reproductionMinCooldown,
      reproductionProbabilityBase: settings.reproductionProbabilityBase,
      maxReproductions: settings.maxReproductions,
      neighborReproductionRadius: settings.neighborReproductionRadius,
      neighborReproductionPenalty: settings.neighborReproductionPenalty,
      maxReproductionNeighbors: settings.maxReproductionNeighbors,
      countPerSnakeCoeff: settings.foodCountPerSnakeCoeff,
      countBase: settings.foodCountBase,
    },
    walls: {
      clusterCoeff: settings.wallClusterCoeff,
      clusterBase: settings.wallClusterBase,
      lengthCoeff: settings.wallLengthCoeff,
      lengthBase: settings.wallLengthBase,
    },
    scoring: {
      targetScoreCoeff: settings.targetScoreCoeff,
      targetScoreBase: settings.targetScoreBase,
    },
    board: {
      baseWidth: settings.baseWidth,
      baseHeight: settings.baseHeight,
      levelSizeIncrement: settings.levelSizeIncrement,
      levelTimeLimit: settings.levelTimeLimit,
      tickIntervalMs: settings.tickIntervalMs,
    },
    ai: {
      visionSize: settings.visionSize,
      obstacleSignalClose: settings.obstacleSignalClose,
      obstacleSignalDecay: settings.obstacleSignalDecay,
      foodSignalClose: settings.foodSignalClose,
      foodSignalDecay: settings.foodSignalDecay,
      foodSignalMin: settings.foodSignalMin,
    },
    colors: {
      bg: settings.colorBg,
      grid: settings.colorGrid,
      wall: settings.colorWall,
      foodAdult: settings.colorFoodAdult,
      foodYoung: settings.colorFoodYoung,
      foodOld: settings.colorFoodOld,
      headStroke: settings.colorHeadStroke,
      snakeColors: [...settings.snakeColors],
    },
    levelOverrides: { ...settings.levelOverrides },
    levelSettingsOverrides: { ...settings.levelSettingsOverrides },
    fieldScopes: { ...settings.fieldScopes },
  };
}

/**
 * Apply a parsed JSON object (same structure as gameDefaults.json) to gameSettings.
 * Handles partial data gracefully — only overwrites fields that exist in the input.
 */
export function applyJSONToSettings(data: Partial<GameDefaultsJSON>): void {
  const settings = gameSettings;
  if (data.snake) {
    if (data.snake.hungerThreshold != null)    settings.hungerThreshold = data.snake.hungerThreshold;
    if (data.snake.minSnakeLength != null)     settings.minSnakeLength = data.snake.minSnakeLength;
    if (data.snake.initialSnakeLength != null)  settings.initialSnakeLength = data.snake.initialSnakeLength;
  }
  if (data.food) {
    if (data.food.youngAge != null)                    settings.foodYoungAge = data.food.youngAge;
    if (data.food.adultAge != null)                    settings.foodAdultAge = data.food.adultAge;
    if (data.food.maxAge != null)                      settings.foodMaxAge = data.food.maxAge;
    if (data.food.minDistance != null)                 settings.foodMinDistance = data.food.minDistance;
    if (data.food.reproductionMinCooldown != null)     settings.reproductionMinCooldown = data.food.reproductionMinCooldown;
    if (data.food.reproductionProbabilityBase != null) settings.reproductionProbabilityBase = data.food.reproductionProbabilityBase;
    if (data.food.maxReproductions != null)            settings.maxReproductions = data.food.maxReproductions;
    if (data.food.neighborReproductionRadius != null)  settings.neighborReproductionRadius = data.food.neighborReproductionRadius;
    if (data.food.neighborReproductionPenalty != null) settings.neighborReproductionPenalty = data.food.neighborReproductionPenalty;
    if (data.food.maxReproductionNeighbors != null)    settings.maxReproductionNeighbors = data.food.maxReproductionNeighbors;
    if (data.food.countPerSnakeCoeff != null)          settings.foodCountPerSnakeCoeff = data.food.countPerSnakeCoeff;
    if (data.food.countBase != null)                   settings.foodCountBase = data.food.countBase;
  }
  if (data.walls) {
    if (data.walls.clusterCoeff != null)  settings.wallClusterCoeff = data.walls.clusterCoeff;
    if (data.walls.clusterBase != null)   settings.wallClusterBase = data.walls.clusterBase;
    if (data.walls.lengthCoeff != null)   settings.wallLengthCoeff = data.walls.lengthCoeff;
    if (data.walls.lengthBase != null)    settings.wallLengthBase = data.walls.lengthBase;
  }
  if (data.scoring) {
    if (data.scoring.targetScoreCoeff != null)  settings.targetScoreCoeff = data.scoring.targetScoreCoeff;
    if (data.scoring.targetScoreBase != null)   settings.targetScoreBase = data.scoring.targetScoreBase;
  }
  if (data.board) {
    if (data.board.baseWidth != null)          settings.baseWidth = data.board.baseWidth;
    if (data.board.baseHeight != null)         settings.baseHeight = data.board.baseHeight;
    if (data.board.levelSizeIncrement != null)  settings.levelSizeIncrement = data.board.levelSizeIncrement;
    if (data.board.levelTimeLimit != null)      settings.levelTimeLimit = data.board.levelTimeLimit;
    if (data.board.tickIntervalMs != null)      settings.tickIntervalMs = data.board.tickIntervalMs;
  }
  if (data.ai) {
    if (data.ai.visionSize != null)           settings.visionSize = data.ai.visionSize;
    if (data.ai.obstacleSignalClose != null)  settings.obstacleSignalClose = data.ai.obstacleSignalClose;
    if (data.ai.obstacleSignalDecay != null)  settings.obstacleSignalDecay = data.ai.obstacleSignalDecay;
    if (data.ai.foodSignalClose != null)    settings.foodSignalClose = data.ai.foodSignalClose;
    if (data.ai.foodSignalDecay != null)    settings.foodSignalDecay = data.ai.foodSignalDecay;
    if (data.ai.foodSignalMin != null)      settings.foodSignalMin = data.ai.foodSignalMin;
  }
  if (data.colors) {
    if (data.colors.bg != null)          settings.colorBg = data.colors.bg;
    if (data.colors.grid != null)        settings.colorGrid = data.colors.grid;
    if (data.colors.wall != null)        settings.colorWall = data.colors.wall;
    if (data.colors.foodAdult != null)   settings.colorFoodAdult = data.colors.foodAdult;
    if (data.colors.foodYoung != null)   settings.colorFoodYoung = data.colors.foodYoung;
    if (data.colors.foodOld != null)     settings.colorFoodOld = data.colors.foodOld;
    if (data.colors.headStroke != null)  settings.colorHeadStroke = data.colors.headStroke;
    if (data.colors.snakeColors)         settings.snakeColors = [...data.colors.snakeColors];
  }
  if (data.levelOverrides) {
    settings.levelOverrides = { ...data.levelOverrides };
  }
  if (data.levelSettingsOverrides) {
    settings.levelSettingsOverrides = { ...data.levelSettingsOverrides };
  }
  if (data.fieldScopes) {
    settings.fieldScopes = { ...settings.fieldScopes, ...data.fieldScopes };
  }
}

/**
 * Get the level override for a specific level, or empty defaults.
 * If settings is provided, reads from it; otherwise falls back to the singleton.
 */
export function getLevelOverride(level: number, settings?: GameSettings): LevelOverride {
  const settingsSource = settings ?? gameSettings;
  return settingsSource.levelOverrides[String(level)] || {};
}

/**
 * Set the level override for a specific level.
 */
export function setLevelOverride(level: number, override: LevelOverride): void {
  gameSettings.levelOverrides[String(level)] = override;
}

export function getLevelSettingsOverride(level: number, settings?: GameSettings): LevelSettingsOverride {
  const src = settings ?? gameSettings;
  return src.levelSettingsOverrides[String(level)] || {};
}

export function setLevelSettingOverride(level: number, key: string, value: number | string): void {
  const levelKey = String(level);
  if (!gameSettings.levelSettingsOverrides[levelKey]) {
    gameSettings.levelSettingsOverrides[levelKey] = {};
  }
  gameSettings.levelSettingsOverrides[levelKey][key] = value;
}

export function clearLevelSettingOverride(level: number, key: string): void {
  const levelKey = String(level);
  const override = gameSettings.levelSettingsOverrides[levelKey];
  if (!override) return;
  delete override[key];
  if (Object.keys(override).length === 0) {
    delete gameSettings.levelSettingsOverrides[levelKey];
  }
}

export function applyLevelSettingOverrides(level: number, settings?: GameSettings): void {
  const target = settings ?? gameSettings;
  const override = target.levelSettingsOverrides[String(level)];
  if (!override) return;
  for (const [key, value] of Object.entries(override)) {
    (target as any)[key] = value;
  }
}

function createDefaultFieldScopes(): Record<string, boolean> {
  const keys = [
    'hungerThreshold', 'initialSnakeLength', 'minSnakeLength',
    'foodYoungAge', 'foodAdultAge', 'foodMaxAge',
    'foodMinDistance', 'reproductionMinCooldown', 'reproductionProbabilityBase',
    'maxReproductions', 'neighborReproductionRadius', 'maxReproductionNeighbors',
    'neighborReproductionPenalty', 'foodCountPerSnakeCoeff', 'foodCountBase',
    'wallClusterCoeff', 'wallClusterBase', 'wallLengthCoeff', 'wallLengthBase',
    'targetScoreCoeff', 'targetScoreBase',
    'baseWidth', 'baseHeight', 'levelSizeIncrement', 'levelTimeLimit', 'tickIntervalMs',
    'visionSize', 'obstacleSignalClose', 'obstacleSignalDecay', 'foodSignalClose',
    'foodSignalDecay', 'foodSignalMin',
    'colorBg', 'colorGrid', 'colorWall', 'colorFoodAdult', 'colorFoodYoung', 'colorFoodOld', 'colorHeadStroke',
  ];
  const scopes: Record<string, boolean> = {};
  for (const key of keys) scopes[key] = true;
  return scopes;
}

function defineLegacyAliases(settings: GameSettings): void {
  const aliases: Array<[keyof GameSettings, keyof GameSettings]> = [
    ['rabbitYoungAge', 'foodYoungAge'],
    ['rabbitAdultAge', 'foodAdultAge'],
    ['rabbitMaxAge', 'foodMaxAge'],
    ['rabbitMinDistance', 'foodMinDistance'],
    ['rabbitCountPerSnakeCoeff', 'foodCountPerSnakeCoeff'],
    ['rabbitCountBase', 'foodCountBase'],
    ['rabbitSignalClose', 'foodSignalClose'],
    ['rabbitSignalDecay', 'foodSignalDecay'],
    ['rabbitSignalMin', 'foodSignalMin'],
    ['colorRabbit', 'colorFoodAdult'],
    ['colorRabbitYoung', 'colorFoodYoung'],
    ['colorRabbitOld', 'colorFoodOld'],
  ];

  for (const [legacyKey, modernKey] of aliases) {
    Object.defineProperty(settings, legacyKey, {
      get() {
        return (settings as any)[modernKey];
      },
      set(value: unknown) {
        (settings as any)[modernKey] = value;
      },
      configurable: true,
      enumerable: false,
    });
  }
}
