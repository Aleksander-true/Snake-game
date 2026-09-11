import { applyDirection } from '../engine/systems/movementSystem';
import { EngineContext } from '../engine/context';
import { createDefaultSettings, GameSettings } from '../engine/settings';
import { GameConfig, GameState } from '../engine/types';
import { GameEngine } from '../engine/GameEngine';
import { TickResult } from '../engine/events';
import { createSeededRng } from './seededRng';
import { RandomPort } from '../engine/ports';
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
  private readonly algorithmRng: RandomPort;
  private readonly deathTickBySnakeId = new Map<number, number>();
  private readonly foodEatenBySnakeId = new Map<number, number>();
  private readonly foodApproachBySnakeId = new Map<number, number>();
  private readonly foodTargetBySnakeId = new Map<
    number,
    { foodId: string; foodX: number; foodY: number; bestDistance: number }
  >();

  constructor(config: ArenaConfig) {
    this.seed = config.seed ?? 1;
    this.algorithmRng = createSeededRng(this.seed ^ 0x5f3759df);
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
    this.foodEatenBySnakeId.clear();
    this.foodApproachBySnakeId.clear();
    this.foodTargetBySnakeId.clear();
    for (const snake of this.state.snakes) this.resetFoodTarget(snake.id);
    const limit = Math.max(1, maxTicks);

    while (
      !this.state.gameOver &&
      !this.state.levelComplete &&
      this.state.tickCount < limit
    ) {
      this.applyBotDirections();
      const tickResult = this.engine.processTick(this.state);
      this.collectFood(tickResult);
      this.collectFoodApproach(tickResult);
      this.collectDeathTicks(tickResult, this.state.tickCount);
    }

    const ticksExecuted = this.state.tickCount;
    const elapsedMs = ticksExecuted * this.engine.getSettings().tickIntervalMs;
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
        this.engine.getSettings(),
        this.algorithmRng
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

  private collectFood(result: TickResult): void {
    for (const event of result.events) {
      if (event.type !== 'FOOD_EATEN') continue;
      this.foodEatenBySnakeId.set(
        event.snakeId,
        (this.foodEatenBySnakeId.get(event.snakeId) ?? 0) + 1,
      );
    }
  }

  private collectFoodApproach(result: TickResult): void {
    const ateFood = new Set(
      result.events
        .filter((event) => event.type === 'FOOD_EATEN')
        .map((event) => event.snakeId),
    );
    for (const snake of this.state.snakes) {
      if (!snake.alive) continue;
      if (ateFood.has(snake.id)) {
        this.resetFoodTarget(snake.id);
        continue;
      }
      const target = this.foodTargetBySnakeId.get(snake.id);
      const food = target && this.state.foods.find((item) => item.id === target.foodId);
      if (!target || !food) {
        this.resetFoodTarget(snake.id);
        continue;
      }
      if (food.pos.x !== target.foodX || food.pos.y !== target.foodY) {
        target.foodX = food.pos.x;
        target.foodY = food.pos.y;
        target.bestDistance = Math.abs(snake.head.x - food.pos.x) + Math.abs(snake.head.y - food.pos.y);
        continue;
      }
      const distance = Math.abs(snake.head.x - food.pos.x) + Math.abs(snake.head.y - food.pos.y);
      if (distance >= target.bestDistance) continue;
      this.foodApproachBySnakeId.set(
        snake.id,
        (this.foodApproachBySnakeId.get(snake.id) ?? 0) + target.bestDistance - distance,
      );
      target.bestDistance = distance;
    }
  }

  private resetFoodTarget(snakeId: number): void {
    const snake = this.state.snakes.find((item) => item.id === snakeId);
    if (!snake || this.state.foods.length === 0) {
      this.foodTargetBySnakeId.delete(snakeId);
      return;
    }
    const nearest = this.state.foods.reduce((best, food) => {
      const distance = Math.abs(snake.head.x - food.pos.x) + Math.abs(snake.head.y - food.pos.y);
      return distance < best.distance ? { food, distance } : best;
    }, {
      food: this.state.foods[0],
      distance: Number.POSITIVE_INFINITY,
    });
    this.foodTargetBySnakeId.set(snakeId, {
      foodId: nearest.food.id,
      foodX: nearest.food.pos.x,
      foodY: nearest.food.pos.y,
      bestDistance: nearest.distance,
    });
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
        foodEaten: this.foodEatenBySnakeId.get(snake.id) ?? 0,
        foodApproachProgress: this.foodApproachBySnakeId.get(snake.id) ?? 0,
        finalLength: snake.segments.length,
        levelsWon: snake.levelsWon,
        survivedTicks,
        survivedMs: survivedTicks * this.engine.getSettings().tickIntervalMs,
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
