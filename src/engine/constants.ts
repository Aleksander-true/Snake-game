/** Base board dimensions */
export const BASE_WIDTH = 40;
export const BASE_HEIGHT = 40;

/** Board growth per level */
export const LEVEL_SIZE_INCREMENT = 5;

/** Initial snake length */
export const INITIAL_SNAKE_LENGTH = 5;

/** Ticks without food before losing a segment */
export const HUNGER_THRESHOLD = 15;

/** Minimum snake length — below this, snake dies of starvation */
export const MIN_SNAKE_LENGTH = 2;

/** Rabbit reproduction window (inclusive) */
export const REPRODUCTION_MIN_TICK = 5;
export const REPRODUCTION_MAX_TICK = 15;

/** Base reproduction probability multiplier per clockNum */
export const REPRODUCTION_PROBABILITY_BASE = 0.05;

/** Max reproductions per rabbit lifetime */
export const MAX_REPRODUCTIONS = 5;

/** Minimum Chebyshev distance between rabbits */
export const MIN_RABBIT_DISTANCE = 2; // >1 means distance must be >= 2

/** Neighbor penalty for reproduction: -25% per nearby rabbit */
export const NEIGHBOR_REPRODUCTION_PENALTY = 0.25;

/** Max neighbors that kill reproduction entirely */
export const MAX_REPRODUCTION_NEIGHBORS = 4;

/** Level time limit in seconds (multiplayer) */
export const LEVEL_TIME_LIMIT = 180; // 3 minutes

/** Tick interval in milliseconds */
export const TICK_INTERVAL_MS = 150;

/** Bot vision grid size */
export const VISION_SIZE = 20;

/** Obstacle signal values for vision */
export const OBSTACLE_SIGNAL_CLOSE = -100;
export const OBSTACLE_SIGNAL_DECAY = 20;

/** Rabbit signal values for vision */
export const RABBIT_SIGNAL_CLOSE = 100;
export const RABBIT_SIGNAL_DECAY = 20;
export const RABBIT_SIGNAL_MIN = 5;
