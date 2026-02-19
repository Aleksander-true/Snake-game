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
  rabbitCount?: number;
}

export type LevelSettingsOverride = Record<string, number | string>;

/* ====== Main settings interface ====== */

export interface GameSettings {
  /* Snake */
  hungerThreshold: number;
  minSnakeLength: number;
  initialSnakeLength: number;

  /* Rabbits — lifecycle */
  rabbitYoungAge: number;
  rabbitAdultAge: number;
  rabbitMaxAge: number;

  /* Rabbits — spawning */
  rabbitMinDistance: number;

  /* Rabbits — reproduction */
  reproductionMinCooldown: number;
  reproductionProbabilityBase: number;
  maxReproductions: number;
  neighborReproductionRadius: number;
  neighborReproductionPenalty: number;
  maxReproductionNeighbors: number;

  /* Rabbits — generation formula */
  rabbitCountPerSnakeCoeff: number;
  rabbitCountBase: number;

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
  rabbitSignalClose: number;
  rabbitSignalDecay: number;
  rabbitSignalMin: number;

  /* Colors (canvas) */
  colorBg: string;
  colorGrid: string;
  colorWall: string;
  colorRabbit: string;
  colorRabbitYoung: string;
  colorRabbitOld: string;
  colorHeadStroke: string;
  snakeColors: string[];

  /* Per-level overrides (keyed by level number as string) */
  levelOverrides: Record<string, LevelOverride>;
  levelSettingsOverrides: Record<string, LevelSettingsOverride>;
  fieldScopes: Record<string, boolean>;
}

/* ====== Build defaults from JSON ====== */

export function createDefaultSettings(): GameSettings {
  const defaultJson = defaults;
  const fieldScopes = createDefaultFieldScopes();
  return {
    hungerThreshold:              defaultJson.snake.hungerThreshold,
    minSnakeLength:               defaultJson.snake.minSnakeLength,
    initialSnakeLength:           defaultJson.snake.initialSnakeLength,

    rabbitYoungAge:               defaultJson.rabbit.youngAge,
    rabbitAdultAge:               defaultJson.rabbit.adultAge,
    rabbitMaxAge:                 defaultJson.rabbit.maxAge,
    rabbitMinDistance:             defaultJson.rabbit.minDistance,
    reproductionMinCooldown:      defaultJson.rabbit.reproductionMinCooldown,
    reproductionProbabilityBase:  defaultJson.rabbit.reproductionProbabilityBase,
    maxReproductions:             defaultJson.rabbit.maxReproductions,
    neighborReproductionRadius:   defaultJson.rabbit.neighborReproductionRadius,
    neighborReproductionPenalty:  defaultJson.rabbit.neighborReproductionPenalty,
    maxReproductionNeighbors:     defaultJson.rabbit.maxReproductionNeighbors,
    rabbitCountPerSnakeCoeff:     defaultJson.rabbit.countPerSnakeCoeff,
    rabbitCountBase:              defaultJson.rabbit.countBase,

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
    rabbitSignalClose:            defaultJson.ai.rabbitSignalClose,
    rabbitSignalDecay:            defaultJson.ai.rabbitSignalDecay,
    rabbitSignalMin:              defaultJson.ai.rabbitSignalMin,

    colorBg:                      defaultJson.colors.bg,
    colorGrid:                    defaultJson.colors.grid,
    colorWall:                    defaultJson.colors.wall,
    colorRabbit:                  defaultJson.colors.rabbit,
    colorRabbitYoung:             defaultJson.colors.rabbitYoung,
    colorRabbitOld:               defaultJson.colors.rabbitOld,
    colorHeadStroke:              defaultJson.colors.headStroke,
    snakeColors:                  [...defaultJson.colors.snakeColors],

    levelOverrides:               { ...(defaultJson.levelOverrides as Record<string, LevelOverride>) },
    levelSettingsOverrides:       {},
    fieldScopes,
  };
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
  rabbit: {
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
    rabbitSignalClose: number;
    rabbitSignalDecay: number;
    rabbitSignalMin: number;
  };
  colors: {
    bg: string;
    grid: string;
    wall: string;
    rabbit: string;
    rabbitYoung: string;
    rabbitOld: string;
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
    rabbit: {
      youngAge: settings.rabbitYoungAge,
      adultAge: settings.rabbitAdultAge,
      maxAge: settings.rabbitMaxAge,
      minDistance: settings.rabbitMinDistance,
      reproductionMinCooldown: settings.reproductionMinCooldown,
      reproductionProbabilityBase: settings.reproductionProbabilityBase,
      maxReproductions: settings.maxReproductions,
      neighborReproductionRadius: settings.neighborReproductionRadius,
      neighborReproductionPenalty: settings.neighborReproductionPenalty,
      maxReproductionNeighbors: settings.maxReproductionNeighbors,
      countPerSnakeCoeff: settings.rabbitCountPerSnakeCoeff,
      countBase: settings.rabbitCountBase,
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
      rabbitSignalClose: settings.rabbitSignalClose,
      rabbitSignalDecay: settings.rabbitSignalDecay,
      rabbitSignalMin: settings.rabbitSignalMin,
    },
    colors: {
      bg: settings.colorBg,
      grid: settings.colorGrid,
      wall: settings.colorWall,
      rabbit: settings.colorRabbit,
      rabbitYoung: settings.colorRabbitYoung,
      rabbitOld: settings.colorRabbitOld,
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
  if (data.rabbit) {
    if (data.rabbit.youngAge != null)                    settings.rabbitYoungAge = data.rabbit.youngAge;
    if (data.rabbit.adultAge != null)                    settings.rabbitAdultAge = data.rabbit.adultAge;
    if (data.rabbit.maxAge != null)                      settings.rabbitMaxAge = data.rabbit.maxAge;
    if (data.rabbit.minDistance != null)                  settings.rabbitMinDistance = data.rabbit.minDistance;
    if (data.rabbit.reproductionMinCooldown != null)     settings.reproductionMinCooldown = data.rabbit.reproductionMinCooldown;
    if (data.rabbit.reproductionProbabilityBase != null)  settings.reproductionProbabilityBase = data.rabbit.reproductionProbabilityBase;
    if (data.rabbit.maxReproductions != null)             settings.maxReproductions = data.rabbit.maxReproductions;
    if (data.rabbit.neighborReproductionRadius != null)   settings.neighborReproductionRadius = data.rabbit.neighborReproductionRadius;
    if (data.rabbit.neighborReproductionPenalty != null)   settings.neighborReproductionPenalty = data.rabbit.neighborReproductionPenalty;
    if (data.rabbit.maxReproductionNeighbors != null)     settings.maxReproductionNeighbors = data.rabbit.maxReproductionNeighbors;
    if (data.rabbit.countPerSnakeCoeff != null)           settings.rabbitCountPerSnakeCoeff = data.rabbit.countPerSnakeCoeff;
    if (data.rabbit.countBase != null)                    settings.rabbitCountBase = data.rabbit.countBase;
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
    if (data.ai.rabbitSignalClose != null)    settings.rabbitSignalClose = data.ai.rabbitSignalClose;
    if (data.ai.rabbitSignalDecay != null)    settings.rabbitSignalDecay = data.ai.rabbitSignalDecay;
    if (data.ai.rabbitSignalMin != null)      settings.rabbitSignalMin = data.ai.rabbitSignalMin;
  }
  if (data.colors) {
    if (data.colors.bg != null)          settings.colorBg = data.colors.bg;
    if (data.colors.grid != null)        settings.colorGrid = data.colors.grid;
    if (data.colors.wall != null)        settings.colorWall = data.colors.wall;
    if (data.colors.rabbit != null)      settings.colorRabbit = data.colors.rabbit;
    if (data.colors.rabbitYoung != null)  settings.colorRabbitYoung = data.colors.rabbitYoung;
    if (data.colors.rabbitOld != null)   settings.colorRabbitOld = data.colors.rabbitOld;
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
    'rabbitYoungAge', 'rabbitAdultAge', 'rabbitMaxAge',
    'rabbitMinDistance', 'reproductionMinCooldown', 'reproductionProbabilityBase',
    'maxReproductions', 'neighborReproductionRadius', 'maxReproductionNeighbors',
    'neighborReproductionPenalty', 'rabbitCountPerSnakeCoeff', 'rabbitCountBase',
    'wallClusterCoeff', 'wallClusterBase', 'wallLengthCoeff', 'wallLengthBase',
    'targetScoreCoeff', 'targetScoreBase',
    'baseWidth', 'baseHeight', 'levelSizeIncrement', 'levelTimeLimit', 'tickIntervalMs',
    'visionSize', 'obstacleSignalClose', 'obstacleSignalDecay', 'rabbitSignalClose',
    'rabbitSignalDecay', 'rabbitSignalMin',
    'colorBg', 'colorGrid', 'colorWall', 'colorRabbit', 'colorRabbitYoung', 'colorRabbitOld', 'colorHeadStroke',
  ];
  const scopes: Record<string, boolean> = {};
  for (const key of keys) scopes[key] = true;
  return scopes;
}
