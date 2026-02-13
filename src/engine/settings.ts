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
}

/* ====== Build defaults from JSON ====== */

export function createDefaultSettings(): GameSettings {
  const d = defaults;
  return {
    hungerThreshold:              d.snake.hungerThreshold,
    minSnakeLength:               d.snake.minSnakeLength,
    initialSnakeLength:           d.snake.initialSnakeLength,

    rabbitYoungAge:               d.rabbit.youngAge,
    rabbitAdultAge:               d.rabbit.adultAge,
    rabbitMaxAge:                 d.rabbit.maxAge,
    rabbitMinDistance:             d.rabbit.minDistance,
    reproductionMinCooldown:      d.rabbit.reproductionMinCooldown,
    reproductionProbabilityBase:  d.rabbit.reproductionProbabilityBase,
    maxReproductions:             d.rabbit.maxReproductions,
    neighborReproductionRadius:   d.rabbit.neighborReproductionRadius,
    neighborReproductionPenalty:  d.rabbit.neighborReproductionPenalty,
    maxReproductionNeighbors:     d.rabbit.maxReproductionNeighbors,
    rabbitCountPerSnakeCoeff:     d.rabbit.countPerSnakeCoeff,
    rabbitCountBase:              d.rabbit.countBase,

    wallClusterCoeff:             d.walls.clusterCoeff,
    wallClusterBase:              d.walls.clusterBase,
    wallLengthCoeff:              d.walls.lengthCoeff,
    wallLengthBase:               d.walls.lengthBase,

    targetScoreCoeff:             d.scoring.targetScoreCoeff,
    targetScoreBase:              d.scoring.targetScoreBase,

    baseWidth:                    d.board.baseWidth,
    baseHeight:                   d.board.baseHeight,
    levelSizeIncrement:           d.board.levelSizeIncrement,
    levelTimeLimit:               d.board.levelTimeLimit,
    tickIntervalMs:               d.board.tickIntervalMs,

    visionSize:                   d.ai.visionSize,
    obstacleSignalClose:          d.ai.obstacleSignalClose,
    obstacleSignalDecay:          d.ai.obstacleSignalDecay,
    rabbitSignalClose:            d.ai.rabbitSignalClose,
    rabbitSignalDecay:            d.ai.rabbitSignalDecay,
    rabbitSignalMin:              d.ai.rabbitSignalMin,

    colorBg:                      d.colors.bg,
    colorGrid:                    d.colors.grid,
    colorWall:                    d.colors.wall,
    colorRabbit:                  d.colors.rabbit,
    colorRabbitYoung:             d.colors.rabbitYoung,
    colorRabbitOld:               d.colors.rabbitOld,
    colorHeadStroke:              d.colors.headStroke,
    snakeColors:                  [...d.colors.snakeColors],

    levelOverrides:               { ...(d.levelOverrides as Record<string, LevelOverride>) },
  };
}

/** The singleton mutable settings object. */
export const gameSettings: GameSettings = createDefaultSettings();

/** Reset all settings to defaults (from JSON). */
export function resetSettings(): void {
  Object.assign(gameSettings, createDefaultSettings());
}

/* ====== localStorage persistence for dev settings ====== */

const DEV_SETTINGS_KEY = 'snake-dev-settings';

/** Save current gameSettings to localStorage. */
export function saveSettingsToStorage(): void {
  const data = settingsToJSON();
  localStorage.setItem(DEV_SETTINGS_KEY, JSON.stringify(data));
}

/** Load settings from localStorage (if present). Returns true if loaded. */
export function loadSettingsFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(DEV_SETTINGS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    applyJSONToSettings(data);
    return true;
  } catch {
    return false;
  }
}

/** Clear dev settings from localStorage. */
export function clearSettingsStorage(): void {
  localStorage.removeItem(DEV_SETTINGS_KEY);
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
}

/**
 * Convert current gameSettings to a structured JSON object
 * matching the format of gameDefaults.json — always ALL fields.
 */
export function settingsToJSON(): GameDefaultsJSON {
  const s = gameSettings;
  return {
    snake: {
      hungerThreshold: s.hungerThreshold,
      minSnakeLength: s.minSnakeLength,
      initialSnakeLength: s.initialSnakeLength,
    },
    rabbit: {
      youngAge: s.rabbitYoungAge,
      adultAge: s.rabbitAdultAge,
      maxAge: s.rabbitMaxAge,
      minDistance: s.rabbitMinDistance,
      reproductionMinCooldown: s.reproductionMinCooldown,
      reproductionProbabilityBase: s.reproductionProbabilityBase,
      maxReproductions: s.maxReproductions,
      neighborReproductionRadius: s.neighborReproductionRadius,
      neighborReproductionPenalty: s.neighborReproductionPenalty,
      maxReproductionNeighbors: s.maxReproductionNeighbors,
      countPerSnakeCoeff: s.rabbitCountPerSnakeCoeff,
      countBase: s.rabbitCountBase,
    },
    walls: {
      clusterCoeff: s.wallClusterCoeff,
      clusterBase: s.wallClusterBase,
      lengthCoeff: s.wallLengthCoeff,
      lengthBase: s.wallLengthBase,
    },
    scoring: {
      targetScoreCoeff: s.targetScoreCoeff,
      targetScoreBase: s.targetScoreBase,
    },
    board: {
      baseWidth: s.baseWidth,
      baseHeight: s.baseHeight,
      levelSizeIncrement: s.levelSizeIncrement,
      levelTimeLimit: s.levelTimeLimit,
      tickIntervalMs: s.tickIntervalMs,
    },
    ai: {
      visionSize: s.visionSize,
      obstacleSignalClose: s.obstacleSignalClose,
      obstacleSignalDecay: s.obstacleSignalDecay,
      rabbitSignalClose: s.rabbitSignalClose,
      rabbitSignalDecay: s.rabbitSignalDecay,
      rabbitSignalMin: s.rabbitSignalMin,
    },
    colors: {
      bg: s.colorBg,
      grid: s.colorGrid,
      wall: s.colorWall,
      rabbit: s.colorRabbit,
      rabbitYoung: s.colorRabbitYoung,
      rabbitOld: s.colorRabbitOld,
      headStroke: s.colorHeadStroke,
      snakeColors: [...s.snakeColors],
    },
    levelOverrides: { ...s.levelOverrides },
  };
}

/**
 * Apply a parsed JSON object (same structure as gameDefaults.json) to gameSettings.
 * Handles partial data gracefully — only overwrites fields that exist in the input.
 */
export function applyJSONToSettings(data: Partial<GameDefaultsJSON>): void {
  const s = gameSettings;
  if (data.snake) {
    if (data.snake.hungerThreshold != null)    s.hungerThreshold = data.snake.hungerThreshold;
    if (data.snake.minSnakeLength != null)     s.minSnakeLength = data.snake.minSnakeLength;
    if (data.snake.initialSnakeLength != null)  s.initialSnakeLength = data.snake.initialSnakeLength;
  }
  if (data.rabbit) {
    if (data.rabbit.youngAge != null)                    s.rabbitYoungAge = data.rabbit.youngAge;
    if (data.rabbit.adultAge != null)                    s.rabbitAdultAge = data.rabbit.adultAge;
    if (data.rabbit.maxAge != null)                      s.rabbitMaxAge = data.rabbit.maxAge;
    if (data.rabbit.minDistance != null)                  s.rabbitMinDistance = data.rabbit.minDistance;
    if (data.rabbit.reproductionMinCooldown != null)     s.reproductionMinCooldown = data.rabbit.reproductionMinCooldown;
    if (data.rabbit.reproductionProbabilityBase != null)  s.reproductionProbabilityBase = data.rabbit.reproductionProbabilityBase;
    if (data.rabbit.maxReproductions != null)             s.maxReproductions = data.rabbit.maxReproductions;
    if (data.rabbit.neighborReproductionRadius != null)   s.neighborReproductionRadius = data.rabbit.neighborReproductionRadius;
    if (data.rabbit.neighborReproductionPenalty != null)   s.neighborReproductionPenalty = data.rabbit.neighborReproductionPenalty;
    if (data.rabbit.maxReproductionNeighbors != null)     s.maxReproductionNeighbors = data.rabbit.maxReproductionNeighbors;
    if (data.rabbit.countPerSnakeCoeff != null)           s.rabbitCountPerSnakeCoeff = data.rabbit.countPerSnakeCoeff;
    if (data.rabbit.countBase != null)                    s.rabbitCountBase = data.rabbit.countBase;
  }
  if (data.walls) {
    if (data.walls.clusterCoeff != null)  s.wallClusterCoeff = data.walls.clusterCoeff;
    if (data.walls.clusterBase != null)   s.wallClusterBase = data.walls.clusterBase;
    if (data.walls.lengthCoeff != null)   s.wallLengthCoeff = data.walls.lengthCoeff;
    if (data.walls.lengthBase != null)    s.wallLengthBase = data.walls.lengthBase;
  }
  if (data.scoring) {
    if (data.scoring.targetScoreCoeff != null)  s.targetScoreCoeff = data.scoring.targetScoreCoeff;
    if (data.scoring.targetScoreBase != null)   s.targetScoreBase = data.scoring.targetScoreBase;
  }
  if (data.board) {
    if (data.board.baseWidth != null)          s.baseWidth = data.board.baseWidth;
    if (data.board.baseHeight != null)         s.baseHeight = data.board.baseHeight;
    if (data.board.levelSizeIncrement != null)  s.levelSizeIncrement = data.board.levelSizeIncrement;
    if (data.board.levelTimeLimit != null)      s.levelTimeLimit = data.board.levelTimeLimit;
    if (data.board.tickIntervalMs != null)      s.tickIntervalMs = data.board.tickIntervalMs;
  }
  if (data.ai) {
    if (data.ai.visionSize != null)           s.visionSize = data.ai.visionSize;
    if (data.ai.obstacleSignalClose != null)  s.obstacleSignalClose = data.ai.obstacleSignalClose;
    if (data.ai.obstacleSignalDecay != null)  s.obstacleSignalDecay = data.ai.obstacleSignalDecay;
    if (data.ai.rabbitSignalClose != null)    s.rabbitSignalClose = data.ai.rabbitSignalClose;
    if (data.ai.rabbitSignalDecay != null)    s.rabbitSignalDecay = data.ai.rabbitSignalDecay;
    if (data.ai.rabbitSignalMin != null)      s.rabbitSignalMin = data.ai.rabbitSignalMin;
  }
  if (data.colors) {
    if (data.colors.bg != null)          s.colorBg = data.colors.bg;
    if (data.colors.grid != null)        s.colorGrid = data.colors.grid;
    if (data.colors.wall != null)        s.colorWall = data.colors.wall;
    if (data.colors.rabbit != null)      s.colorRabbit = data.colors.rabbit;
    if (data.colors.rabbitYoung != null)  s.colorRabbitYoung = data.colors.rabbitYoung;
    if (data.colors.rabbitOld != null)   s.colorRabbitOld = data.colors.rabbitOld;
    if (data.colors.headStroke != null)  s.colorHeadStroke = data.colors.headStroke;
    if (data.colors.snakeColors)         s.snakeColors = [...data.colors.snakeColors];
  }
  if (data.levelOverrides) {
    s.levelOverrides = { ...data.levelOverrides };
  }
}

/**
 * Get the level override for a specific level, or empty defaults.
 */
export function getLevelOverride(level: number): LevelOverride {
  return gameSettings.levelOverrides[String(level)] || {};
}

/**
 * Set the level override for a specific level.
 */
export function setLevelOverride(level: number, override: LevelOverride): void {
  gameSettings.levelOverrides[String(level)] = override;
}
