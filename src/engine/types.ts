/** Direction a snake can face */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Bot decision relative to current heading */
export type BotDecision = 'left' | 'right' | 'front';

/** Cell content on the board */
export type CellContent = ' ' | '&' | '*' | '#';

/** 2D coordinate */
export interface Position {
  x: number;
  y: number;
}

/** Food lifecycle phase */
export type FoodPhase = 'young' | 'adult' | 'old';
export type FoodKind = 'apple' | 'rabbit';
export type GameMode = 'classic' | 'survival';

/**
 * Food shape used by engine systems.
 */
export interface Food {
  pos: Position;
  kind: FoodKind;
  age: number;             // absolute ticks since birth (never resets)
  clockNum: number;        // ticks since birth / last reproduction (resets on repro)
  reproductionCount: number;
  tickLifecycle(): void;
  resetReproductionClock(): void;
  incrementReproductionCount(): void;
}

/**
 * Snake shape used by engine systems.
 */
export interface Snake {
  id: number;
  name: string;
  segments: Position[];    // head is segments[0]
  direction: Direction;
  alive: boolean;
  score: number;
  levelsWon: number;
  ticksWithoutFood: number;
  isBot: boolean;
  deathReason?: string;
  readonly head: Position;
  applyDirection(newDirection: Direction): void;
  getNextHeadPosition(): Position;
  move(grow: boolean): void;
  incrementScore(points?: number): void;
  incrementHungerTick(): void;
  resetHunger(): void;
  trimTail(): void;
  die(reason: string): void;
}

/** Full game state for one level */
export interface GameState {
  board: CellContent[][];
  width: number;
  height: number;
  snakes: Snake[];
  foods: Food[];
  rabbits: Food[]; // legacy alias kept for compatibility in tests/modules
  walls: Position[];
  level: number;
  gameMode?: GameMode;
  difficultyLevel: number;
  tickCount: number;
  lastAutoFoodSpawnTick: number;
  levelTimeLeft: number;   // in seconds
  gameOver: boolean;
  levelComplete: boolean;
}

/** Configuration passed from menu */
export interface GameConfig {
  playerCount: number;      // 0..2
  botCount: number;         // 0..4
  playerNames: string[];    // [player1Name, player2Name]
  difficultyLevel: number;  // 1..10
  gameMode?: GameMode;
}

/** Input for bot AI */
export interface BotInput {
  vision: number[][];
  snakeLength: number;
  ticksWithoutFood: number;
}

/** Score record for localStorage */
export interface ScoreRecord {
  playerName: string;
  score: number;
  levelsWon: number;
  date: string;
  isBot: boolean;
}
