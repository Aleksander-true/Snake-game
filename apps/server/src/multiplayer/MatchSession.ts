import { randomUUID } from 'node:crypto';
import {
  NETWORK_PROTOCOL_VERSION,
  type DirectionCommandMessage,
  type GameSnapshotDTO,
  type RoomParticipantDTO,
  type RoomSnapshotDTO,
  type SnakeControllerDTO,
} from '@snake-game/contracts';
import {
  applyDirection,
  createDefaultSettings,
  createSeededRng,
  GameEngine,
  type GameState,
} from '@snake-game/core';

export interface MatchSessionOptions {
  room: RoomSnapshotDTO;
  onSnapshot: (snapshot: GameSnapshotDTO) => void;
  onComplete?: (snapshot: GameSnapshotDTO) => void;
  seed?: number;
  now?: () => number;
  tickIntervalMs?: number;
}

export class MatchSessionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Owns one authoritative Engine instance and its buffered network input. */
export class MatchSession {
  readonly matchId = randomUUID();

  private readonly engine: GameEngine;
  private state: GameState;
  private room: RoomSnapshotDTO;
  private readonly participantsById: Map<string, RoomParticipantDTO>;
  private readonly pendingInputs = new Map<string, DirectionCommandMessage>();
  private readonly acknowledgedInputs: Record<string, number> = {};
  private readonly tickIntervalMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private levelSecondAccumulatorMs = 0;
  private roundStartScores = new Map<number, number>();
  private foodsEatenThisRound = new Map<number, number>();

  constructor(private readonly options: MatchSessionOptions) {
    if (options.room.status !== 'playing') {
      throw new MatchSessionError('ROOM_NOT_PLAYING', 'Match requires a room in playing state');
    }
    this.room = options.room;
    const participants = [...options.room.participants].sort((left, right) => left.slotIndex - right.slotIndex);
    this.participantsById = new Map(participants.map((participant) => [participant.playerId, participant]));
    const settings = createDefaultSettings();
    this.tickIntervalMs = options.tickIntervalMs ?? settings.tickIntervalMs;
    this.now = options.now ?? Date.now;
    this.engine = new GameEngine({
      settings,
      rng: createSeededRng(options.seed ?? hashSeed(options.room.roomId)),
    });
    const gameConfig = this.createGameConfig();
    this.state = this.engine.createGameState(gameConfig, this.room.currentRound);
    this.engine.initLevel(this.state, gameConfig);
    this.resetRoundTracking();
    for (const participant of participants) this.acknowledgedInputs[participant.playerId] = -1;
  }

  private createGameConfig() {
    const participants = [...this.room.participants].sort((left, right) => left.slotIndex - right.slotIndex);
    return {
      playerCount: participants.length,
      botCount: this.room.config.bots.length,
      playerNames: participants.map((participant) => participant.name),
      difficultyLevel: this.room.config.difficultyLevel,
      gameMode: this.room.config.gameMode,
    };
  }

  start(): void {
    if (this.timer) return;
    this.options.onSnapshot(this.createSnapshot());
    this.timer = setInterval(() => this.processTick(), this.tickIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  startNextRound(room: RoomSnapshotDTO): void {
    if (this.createSnapshot().status !== 'round-complete') {
      throw new MatchSessionError('ROUND_NOT_COMPLETE', 'Current round has not completed');
    }
    if (room.status !== 'playing' || room.currentRound !== this.state.level + 1) {
      throw new MatchSessionError('INVALID_NEXT_ROUND', 'Room does not describe the next playing round');
    }
    const previousState = this.state;
    this.room = room;
    this.state = this.engine.createGameState(this.createGameConfig(), room.currentRound);
    this.engine.initLevel(this.state, this.createGameConfig());
    for (let snakeIndex = 0; snakeIndex < this.state.snakes.length; snakeIndex++) {
      const previousSnake = previousState.snakes[snakeIndex];
      const nextSnake = this.state.snakes[snakeIndex];
      if (!previousSnake || !nextSnake) continue;
      nextSnake.score = previousSnake.score;
      nextSnake.levelsWon = previousSnake.levelsWon;
    }
    this.state.roundResults = [...previousState.roundResults];
    this.pendingInputs.clear();
    this.levelSecondAccumulatorMs = 0;
    this.resetRoundTracking();
    this.start();
  }

  enqueueDirection(playerId: string, command: DirectionCommandMessage): void {
    if (command.matchId !== this.matchId) {
      throw new MatchSessionError('MATCH_NOT_FOUND', 'Direction command targets another match');
    }
    const participant = this.participantsById.get(playerId);
    if (!participant || command.playerId !== playerId) {
      throw new MatchSessionError('PLAYER_MISMATCH', 'Direction command does not belong to this connection');
    }
    const pendingSequence = this.pendingInputs.get(playerId)?.sequence ?? -1;
    const acknowledgedSequence = this.acknowledgedInputs[playerId] ?? -1;
    if (command.sequence <= Math.max(pendingSequence, acknowledgedSequence)) return;
    this.pendingInputs.set(playerId, command);
  }

  processTick(): GameSnapshotDTO {
    for (const [playerId, command] of this.pendingInputs) {
      const participant = this.participantsById.get(playerId);
      const snake = participant ? this.state.snakes[participant.slotIndex] : undefined;
      if (snake?.alive) applyDirection(snake, command.direction);
      this.acknowledgedInputs[playerId] = command.sequence;
    }
    this.pendingInputs.clear();

    const tickResult = this.engine.processTick(this.state);
    for (const event of tickResult.events) {
      if (event.type === 'FOOD_EATEN') {
        this.foodsEatenThisRound.set(event.snakeId, (this.foodsEatenThisRound.get(event.snakeId) ?? 0) + 1);
      }
    }
    this.levelSecondAccumulatorMs += this.tickIntervalMs;
    while (this.levelSecondAccumulatorMs >= 1000) {
      this.engine.elapseLevelSecond(this.state);
      this.levelSecondAccumulatorMs -= 1000;
    }

    if (this.state.levelComplete) {
      const completionEvent = tickResult.events.find((event) => event.type === 'LEVEL_COMPLETED');
      this.recordRoundResult(completionEvent?.type === 'LEVEL_COMPLETED' ? completionEvent.winnerId ?? null : null);
    }
    const snapshot = this.createSnapshot();
    this.options.onSnapshot(snapshot);
    if (snapshot.status !== 'playing') {
      this.stop();
      this.options.onComplete?.(snapshot);
    }
    return snapshot;
  }

  createSnapshot(): GameSnapshotDTO {
    const status = this.state.gameOver
      ? 'game-complete'
      : this.state.levelComplete ? 'round-complete' : 'playing';
    return {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      matchId: this.matchId,
      serverTimeMs: this.now(),
      tick: this.state.tickCount,
      tickIntervalMs: this.tickIntervalMs,
      acknowledgedInputByPlayer: { ...this.acknowledgedInputs },
      status,
      level: this.state.level,
      levelTimeLeft: this.state.levelTimeLeft,
      difficultyLevel: this.state.difficultyLevel,
      width: this.state.width,
      height: this.state.height,
      snakes: this.state.snakes.map((snake) => ({
        snakeId: snake.id,
        slotIndex: snake.id,
        segments: snake.segments.map((segment) => ({ ...segment })),
        direction: snake.direction,
        alive: snake.alive,
        score: snake.score,
        levelsWon: snake.levelsWon,
        ticksWithoutFood: snake.ticksWithoutFood,
        deathReason: snake.deathReason,
        controller: this.createController(snake.id, snake.name, snake.isBot),
      })),
      foods: this.state.foods.map((food) => ({
        position: { ...food.pos },
        kind: food.kind,
        age: food.age,
      })),
      walls: this.state.walls.map((wall) => ({ ...wall })),
    };
  }

  private createController(snakeId: number, snakeName: string, isBot: boolean): SnakeControllerDTO {
    if (isBot) {
      return {
        type: 'bot',
        controllerId: `bot:${snakeId}`,
        displayName: snakeName,
        connected: true,
      };
    }
    const participant = this.room.participants.find((item) => item.slotIndex === snakeId);
    if (!participant) throw new MatchSessionError('PLAYER_NOT_FOUND', `No player owns snake ${snakeId}`);
    return {
      type: 'human',
      controllerId: participant.playerId,
      displayName: participant.name,
      connected: participant.status === 'connected' || participant.status === 'ready',
    };
  }

  private resetRoundTracking(): void {
    this.roundStartScores = new Map(this.state.snakes.map((snake) => [snake.id, snake.score]));
    this.foodsEatenThisRound = new Map(this.state.snakes.map((snake) => [snake.id, 0]));
  }

  private recordRoundResult(winnerId: number | null): void {
    if (this.state.roundResults.some((result) => result.level === this.state.level)) return;
    this.state.roundResults.push({
      level: this.state.level,
      winnerId,
      snakes: this.state.snakes.map((snake) => ({
        snakeId: snake.id,
        name: snake.name,
        isBot: snake.isBot,
        foodsEaten: this.foodsEatenThisRound.get(snake.id) ?? 0,
        scoreGained: snake.score - (this.roundStartScores.get(snake.id) ?? 0),
        totalScore: snake.score,
        alive: snake.alive,
        deathReason: snake.deathReason,
      })),
    });
  }
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
