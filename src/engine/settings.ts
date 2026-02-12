/**
 * Runtime game settings — a mutable copy of constants that the dev panel can override.
 * All systems should read from `gameSettings` instead of importing constants directly.
 */
import * as C from './constants';

export interface GameSettings {
  /* Snake */
  hungerThreshold: number;
  minSnakeLength: number;
  initialSnakeLength: number;

  /* Rabbits */
  reproductionMinTick: number;
  reproductionMaxTick: number;
  reproductionProbabilityBase: number;
  maxReproductions: number;
  neighborReproductionRadius: number;
  neighborReproductionPenalty: number;
  maxReproductionNeighbors: number;

  /* Board / levels */
  baseWidth: number;
  baseHeight: number;
  levelSizeIncrement: number;
  levelTimeLimit: number;
  tickIntervalMs: number;

  /* Colors (canvas) */
  colorBg: string;
  colorGrid: string;
  colorWall: string;
  colorRabbit: string;
  colorHeadStroke: string;
  snakeColors: string[];
}

/** Create default settings from compiled constants. */
export function createDefaultSettings(): GameSettings {
  return {
    hungerThreshold: C.HUNGER_THRESHOLD,
    minSnakeLength: C.MIN_SNAKE_LENGTH,
    initialSnakeLength: C.INITIAL_SNAKE_LENGTH,

    reproductionMinTick: C.REPRODUCTION_MIN_TICK,
    reproductionMaxTick: C.REPRODUCTION_MAX_TICK,
    reproductionProbabilityBase: C.REPRODUCTION_PROBABILITY_BASE,
    maxReproductions: C.MAX_REPRODUCTIONS,
    neighborReproductionRadius: C.NEIGHBOR_REPRODUCTION_RADIUS,
    neighborReproductionPenalty: C.NEIGHBOR_REPRODUCTION_PENALTY,
    maxReproductionNeighbors: C.MAX_REPRODUCTION_NEIGHBORS,

    baseWidth: C.BASE_WIDTH,
    baseHeight: C.BASE_HEIGHT,
    levelSizeIncrement: C.LEVEL_SIZE_INCREMENT,
    levelTimeLimit: C.LEVEL_TIME_LIMIT,
    tickIntervalMs: C.TICK_INTERVAL_MS,

    colorBg: '#000000',
    colorGrid: '#cccccc',
    colorWall: '#FFFFFF',
    colorRabbit: '#FF0000',
    colorHeadStroke: '#FFFFFF',
    snakeColors: ['#00FF00', '#00CCFF', '#FFFF00', '#FF00FF', '#FF8800', '#88FF88'],
  };
}

/**
 * The singleton mutable settings object.
 * Initialized with defaults; dev panel can overwrite fields.
 */
export const gameSettings: GameSettings = createDefaultSettings();

/** Reset all settings to defaults. */
export function resetSettings(): void {
  Object.assign(gameSettings, createDefaultSettings());
}
