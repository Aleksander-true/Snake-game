import { applyDirection } from '../../engine/systems/movementSystem';
import { EngineContext } from '../../engine/context';
import { createDefaultSettings, GameSettings } from '../../engine/settings';
import { GameConfig, GameMode, GameState } from '../../engine/types';
import { GameEngine } from '../../engine/GameEngine';
import { TickResult } from '../../engine/events';
import { HeuristicAlgorithm } from '../types';
import { greedyBoardHeuristic } from '../greedyBoardHeuristic';
import { createSeededRng } from './seededRng';

export interface ArenaParticipant {
  name: string;
  algorithm?: HeuristicAlgorithm;
}

export interface ArenaRunConfig {
  participants: ArenaParticipant[];
  maxTicks: number;
  level?: number;
  difficultyLevel?: number;
  gameMode?: GameMode;
  seed?: number;
  settings?: Partial<GameSettings>;
}

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

export interface ArenaBatchConfig extends Omit<ArenaRunConfig, 'seed'> {
  simulations: number;
  seedBase?: number;
}

export interface ArenaBatchResult {
  runs: ArenaRunResult[];
  summaryByAlgorithm: Record<string, {
    runs: number;
    avgScore: number;
    avgSurvivedTicks: number;
    avgSurvivedMs: number;
  }>;
}

export function runArenaSimulation(config: ArenaRunConfig): ArenaRunResult {
  const seed = config.seed ?? 1;
  const settings = createArenaSettings(config.settings);
  const context: EngineContext = {
    settings,
    rng: createSeededRng(seed),
  };
  const engine = new GameEngine(context);
  const gameConfig = createArenaGameConfig(config);
  const state = engine.createGameState(gameConfig, config.level ?? 1);
  engine.initLevel(state, gameConfig);
  applyArenaNames(state, config.participants);

  const deathTickBySnakeId = new Map<number, number>();
  const maxTicks = Math.max(1, config.maxTicks);

  while (!state.gameOver && !state.levelComplete && state.tickCount < maxTicks) {
    applyArenaBotDirections(state, settings, config.participants);
    const tickResult = engine.processTick(state);
    collectDeathTicks(tickResult, state.tickCount, deathTickBySnakeId);
  }

  const ticksExecuted = state.tickCount;
  const elapsedMs = ticksExecuted * settings.tickIntervalMs;
  return {
    seed,
    ticksExecuted,
    elapsedMs,
    levelComplete: state.levelComplete,
    gameOver: state.gameOver,
    snakes: buildSnakeStats(state, settings, config.participants, deathTickBySnakeId),
  };
}

export function runArenaBatch(config: ArenaBatchConfig): ArenaBatchResult {
  const simulations = Math.max(1, config.simulations);
  const seedBase = config.seedBase ?? 1;
  const runs: ArenaRunResult[] = [];

  for (let runIndex = 0; runIndex < simulations; runIndex++) {
    runs.push(runArenaSimulation({
      ...config,
      seed: seedBase + runIndex,
    }));
  }

  return {
    runs,
    summaryByAlgorithm: aggregateByAlgorithm(runs),
  };
}

function collectDeathTicks(result: TickResult, tick: number, deathTickBySnakeId: Map<number, number>): void {
  for (const event of result.events) {
    if (event.type !== 'SNAKE_DIED') continue;
    if (!deathTickBySnakeId.has(event.snakeId)) {
      deathTickBySnakeId.set(event.snakeId, tick);
    }
  }
}

function buildSnakeStats(
  state: GameState,
  settings: GameSettings,
  participants: ArenaParticipant[],
  deathTickBySnakeId: Map<number, number>
): ArenaSnakeStats[] {
  return state.snakes.map((snake, participantIndex) => {
    const participant = participants[participantIndex];
    const algorithm = participant?.algorithm ?? greedyBoardHeuristic;
    const survivedTicks = deathTickBySnakeId.get(snake.id) ?? state.tickCount;
    return {
      snakeId: snake.id,
      name: snake.name,
      algorithmId: algorithm.id,
      score: snake.score,
      levelsWon: snake.levelsWon,
      survivedTicks,
      survivedMs: survivedTicks * settings.tickIntervalMs,
      aliveAtEnd: snake.alive,
      deathReason: snake.deathReason,
    };
  });
}

function applyArenaBotDirections(state: GameState, settings: GameSettings, participants: ArenaParticipant[]): void {
  for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
    const snake = state.snakes[participantIndex];
    if (!snake || !snake.alive) continue;
    const algorithm = participants[participantIndex].algorithm ?? greedyBoardHeuristic;
    const chosenDirection = algorithm.chooseDirection(state, snake, settings);
    applyDirection(snake, chosenDirection);
  }
}

function applyArenaNames(state: GameState, participants: ArenaParticipant[]): void {
  for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
    const snake = state.snakes[participantIndex];
    if (!snake) continue;
    snake.name = participants[participantIndex].name;
  }
}

function createArenaSettings(overrides?: Partial<GameSettings>): GameSettings {
  const settings = createDefaultSettings();
  if (overrides) {
    Object.assign(settings, overrides);
  }
  return settings;
}

function createArenaGameConfig(config: ArenaRunConfig): GameConfig {
  const botCount = Math.max(1, config.participants.length);
  return {
    playerCount: 0,
    botCount,
    playerNames: [],
    difficultyLevel: config.difficultyLevel ?? 1,
    gameMode: config.gameMode ?? 'classic',
  };
}

function aggregateByAlgorithm(runs: ArenaRunResult[]): ArenaBatchResult['summaryByAlgorithm'] {
  const aggregate: Record<string, { runs: number; score: number; survivedTicks: number; survivedMs: number }> = {};

  for (const run of runs) {
    for (const snake of run.snakes) {
      if (!aggregate[snake.algorithmId]) {
        aggregate[snake.algorithmId] = { runs: 0, score: 0, survivedTicks: 0, survivedMs: 0 };
      }
      aggregate[snake.algorithmId].runs++;
      aggregate[snake.algorithmId].score += snake.score;
      aggregate[snake.algorithmId].survivedTicks += snake.survivedTicks;
      aggregate[snake.algorithmId].survivedMs += snake.survivedMs;
    }
  }

  const summary: ArenaBatchResult['summaryByAlgorithm'] = {};
  for (const [algorithmId, data] of Object.entries(aggregate)) {
    summary[algorithmId] = {
      runs: data.runs,
      avgScore: data.score / data.runs,
      avgSurvivedTicks: data.survivedTicks / data.runs,
      avgSurvivedMs: data.survivedMs / data.runs,
    };
  }

  return summary;
}

