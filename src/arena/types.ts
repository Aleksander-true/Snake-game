import { Direction, GameConfig, GameMode, GameState, Snake } from '../engine/types';
import { GameSettings } from '../engine/settings';

/**
 * Algorithm interface for arena participants.
 * Any implementation can be used, including neural networks.
 */
export interface ArenaAlgorithm {
  id: string;
  chooseDirection(state: GameState, snake: Snake, settings: GameSettings): Direction;
}

export interface ArenaParticipant {
  name: string;
  algorithm: ArenaAlgorithm;
}

export interface ArenaConfig {
  participants: ArenaParticipant[];
  level?: number;
  difficultyLevel?: number;
  gameMode?: GameMode;
  seed?: number;
  settings?: Partial<GameSettings>;
}

/** Fitness metrics per snake for a single run. */
export interface ArenaSnakeStats {
  snakeId: number;
  name: string;
  algorithmId: string;
  score: number;
  levelsWon: number;
  survivedTicks: number;
  survivedMs: number;
  aliveAtEnd: boolean;
  deathReason?: string;
}

export interface ArenaRunResult {
  seed: number;
  ticksExecuted: number;
  elapsedMs: number;
  levelComplete: boolean;
  gameOver: boolean;
  snakes: ArenaSnakeStats[];
}

export interface ArenaRunConfig extends ArenaConfig {
  maxTicks: number;
}

export interface ArenaBatchConfig extends Omit<ArenaConfig, 'seed'> {
  simulations: number;
  maxTicks: number;
  seedBase?: number;
}

export interface ArenaBatchResult {
  runs: ArenaRunResult[];
  summaryByAlgorithm: Record<
    string,
    {
      runs: number;
      avgScore: number;
      avgSurvivedTicks: number;
      avgSurvivedMs: number;
    }
  >;
}
