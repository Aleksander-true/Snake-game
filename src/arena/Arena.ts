import { applyDirection } from '../engine/systems/movementSystem';
import { EngineContext } from '../engine/context';
import { createDefaultSettings, GameSettings } from '../engine/settings';
import { GameConfig, GameState } from '../engine/types';
import { GameEngine } from '../engine/GameEngine';
import { TickResult } from '../engine/events';
import { createSeededRng } from './seededRng';
import type {
  ArenaBatchConfig,
  ArenaBatchResult,
  ArenaConfig,
  ArenaParticipant,
  ArenaRunResult,
  ArenaSnakeStats,
} from './types';

/** Arena for headless simulations. Runs until death, level complete, or maxTicks. */
export class Arena {
  private readonly engine: GameEngine;
  private readonly state: GameState;
  private readonly settings: GameSettings;
  private readonly participants: ArenaParticipant[];
  private readonly seed: number;
  private readonly deathTickBySnakeId = new Map<number, number>();

  constructor(config: ArenaConfig) {
    this.seed = config.seed ?? 1;
    this.settings = this.createArenaSettings(config.settings);
    const context: EngineContext = {
      settings: this.settings,
      rng: createSeededRng(this.seed),
    };
    this.engine = new GameEngine(context);
    const gameConfig = this.createGameConfig(config);
    this.state = this.engine.createGameState(gameConfig, config.level ?? 1);
    this.engine.initLevel(this.state, gameConfig);
    this.participants = config.participants;
    this.applyNames();
  }

  /**
   * Runs one simulation until death, level complete, or maxTicks reached.
   * Returns fitness per snake (score, survivedTicks, survivedMs, etc.).
   */
  runOne(maxTicks: number = 1_000_000): ArenaRunResult {
    this.deathTickBySnakeId.clear();
    const limit = Math.max(1, maxTicks);

    while (
      !this.state.gameOver &&
      !this.state.levelComplete &&
      this.state.tickCount < limit
    ) {
      this.applyBotDirections();
      const tickResult = this.engine.processTick(this.state);
      this.collectDeathTicks(tickResult, this.state.tickCount);
    }

    const ticksExecuted = this.state.tickCount;
    const elapsedMs = ticksExecuted * this.settings.tickIntervalMs;
    return {
      seed: this.seed,
      ticksExecuted,
      elapsedMs,
      levelComplete: this.state.levelComplete,
      gameOver: this.state.gameOver,
      snakes: this.buildSnakeStats(),
    };
  }

  getState(): GameState {
    return this.state;
  }

  private applyNames(): void {
    for (let i = 0; i < this.participants.length; i++) {
      const snake = this.state.snakes[i];
      if (snake) {
        snake.name = this.participants[i].name;
      }
    }
  }

  private applyBotDirections(): void {
    for (let i = 0; i < this.participants.length; i++) {
      const snake = this.state.snakes[i];
      if (!snake || !snake.alive) continue;
      const direction = this.participants[i].algorithm.chooseDirection(
        this.state,
        snake,
        this.settings
      );
      applyDirection(snake, direction);
    }
  }

  private collectDeathTicks(
    result: TickResult,
    tick: number
  ): void {
    for (const event of result.events) {
      if (event.type !== 'SNAKE_DIED') continue;
      if (!this.deathTickBySnakeId.has(event.snakeId)) {
        this.deathTickBySnakeId.set(event.snakeId, tick);
      }
    }
  }

  private buildSnakeStats(): ArenaSnakeStats[] {
    return this.state.snakes.map((snake, i) => {
      const algorithm = this.participants[i].algorithm;
      const survivedTicks =
        this.deathTickBySnakeId.get(snake.id) ?? this.state.tickCount;
      return {
        snakeId: snake.id,
        name: snake.name,
        algorithmId: algorithm.id,
        score: snake.score,
        levelsWon: snake.levelsWon,
        survivedTicks,
        survivedMs: survivedTicks * this.settings.tickIntervalMs,
        aliveAtEnd: snake.alive,
        deathReason: snake.deathReason,
      };
    });
  }

  private createArenaSettings(overrides?: Partial<GameSettings>): GameSettings {
    const settings = createDefaultSettings();
    Object.assign(settings, {
      targetScoreCoeff: 0,
      targetScoreBase: 1_000_000,
    });
    if (overrides) {
      Object.assign(settings, overrides);
    }
    return settings;
  }

  private createGameConfig(config: ArenaConfig): GameConfig {
    const botCount = Math.max(1, config.participants.length);
    return {
      playerCount: 0,
      botCount,
      playerNames: [],
      difficultyLevel: config.difficultyLevel ?? 1,
      gameMode: config.gameMode ?? 'classic',
    };
  }
}
