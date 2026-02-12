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

/** A single rabbit entity */
export interface Rabbit {
  pos: Position;
  clockNum: number;
  reproductionCount: number;
}

/** A single snake entity */
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
}

/** Full game state for one level */
export interface GameState {
  board: CellContent[][];
  width: number;
  height: number;
  snakes: Snake[];
  rabbits: Rabbit[];
  walls: Position[];
  level: number;
  difficultyLevel: number;
  tickCount: number;
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
