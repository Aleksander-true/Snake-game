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
  private readonly state: GameState;
  private readonly participantsById: Map<string, RoomParticipantDTO>;
  private readonly pendingInputs = new Map<string, DirectionCommandMessage>();
  private readonly acknowledgedInputs: Record<string, number> = {};
  private readonly tickIntervalMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private levelSecondAccumulatorMs = 0;

  constructor(private readonly options: MatchSessionOptions) {
    if (options.room.status !== 'playing') {
      throw new MatchSessionError('ROOM_NOT_PLAYING', 'Match requires a room in playing state');
    }
    const participants = [...options.room.participants].sort((left, right) => left.slotIndex - right.slotIndex);
    this.participantsById = new Map(participants.map((participant) => [participant.playerId, participant]));
    const settings = createDefaultSettings();
    this.tickIntervalMs = options.tickIntervalMs ?? settings.tickIntervalMs;
    this.now = options.now ?? Date.now;
    this.engine = new GameEngine({
      settings,
      rng: createSeededRng(options.seed ?? hashSeed(options.room.roomId)),
    });
    const gameConfig = {
      playerCount: participants.length,
      botCount: options.room.config.bots.length,
      playerNames: participants.map((participant) => participant.name),
      difficultyLevel: options.room.config.difficultyLevel,
      gameMode: options.room.config.gameMode,
    };
    this.state = this.engine.createGameState(gameConfig, 1);
    this.engine.initLevel(this.state, gameConfig);
    for (const participant of participants) this.acknowledgedInputs[participant.playerId] = -1;
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

    this.engine.processTick(this.state);
    this.levelSecondAccumulatorMs += this.tickIntervalMs;
    while (this.levelSecondAccumulatorMs >= 1000) {
      this.engine.elapseLevelSecond(this.state);
      this.levelSecondAccumulatorMs -= 1000;
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
    const participant = this.options.room.participants.find((item) => item.slotIndex === snakeId);
    if (!participant) throw new MatchSessionError('PLAYER_NOT_FOUND', `No player owns snake ${snakeId}`);
    return {
      type: 'human',
      controllerId: participant.playerId,
      displayName: participant.name,
      connected: participant.status === 'connected' || participant.status === 'ready',
    };
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
