import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  NETWORK_PROTOCOL_VERSION,
  type DirectionCommandMessage,
  type FastForwardRoundMessage,
  type GameSnapshotDTO,
  type MatchHistoryDTO,
  type RoomParticipantDTO,
  type RoomSnapshotDTO,
  type SnakeControllerDTO,
  type SnakeControllerType,
} from '@snake-game/contracts';
import {
  applyDirection,
  chooseDirectionByDifficulty,
  createDefaultSettings,
  createSeededRng,
  GameEngine,
  type GameState,
} from '@snake-game/core';

const FAST_FORWARD_BATCH_BUDGET_MS = 40;
const FAST_FORWARD_FINAL_FRAME_MS = 1000;

interface ActiveControlPeriod {
  controllerType: SnakeControllerType;
  controllerId: string;
  displayName: string;
  startedAtTick: number;
  scoreAtStart: number;
}

interface ControllerHistory {
  displayName: string;
  controlPeriods: MatchHistoryDTO['participants'][number]['controlPeriods'];
}

export interface MatchSessionOptions {
  room: RoomSnapshotDTO;
  onSnapshot: (snapshot: GameSnapshotDTO) => void;
  onComplete?: (snapshot: GameSnapshotDTO) => void;
  onHistoryReady?: (history: MatchHistoryDTO) => void;
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
  private fastForwardHandle: ReturnType<typeof setImmediate> | null = null;
  private completionDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private fastForwarding = false;
  private levelSecondAccumulatorMs = 0;
  private roundStartScores = new Map<number, number>();
  private foodsEatenThisRound = new Map<number, number>();
  private readonly replacementBotSnakeIds = new Set<number>();
  private readonly startedAt: string;
  private totalTicks = 0;
  private readonly activeControlPeriods = new Map<number, ActiveControlPeriod>();
  private readonly controllerHistories = new Map<string, ControllerHistory>();
  private completedHistory: MatchHistoryDTO | null = null;

  constructor(private readonly options: MatchSessionOptions) {
    if (options.room.status !== 'playing') {
      throw new MatchSessionError('ROOM_NOT_PLAYING', 'Match requires a room in playing state');
    }
    this.room = options.room;
    this.participantsById = new Map();
    const settings = createDefaultSettings();
    this.tickIntervalMs = options.tickIntervalMs ?? settings.tickIntervalMs;
    this.now = options.now ?? Date.now;
    this.startedAt = new Date(this.now()).toISOString();
    this.engine = new GameEngine({
      settings,
      rng: createSeededRng(options.seed ?? hashSeed(options.room.roomId)),
    });
    const gameConfig = this.createGameConfig();
    this.state = this.engine.createGameState(gameConfig, this.room.currentRound);
    this.engine.initLevel(this.state, gameConfig);
    this.syncParticipants();
    this.applyParticipantControllerStates();
    this.openMissingControlPeriods();
    this.resetRoundTracking();
  }

  private createGameConfig() {
    return {
      playerCount: this.room.config.humanSlots,
      botCount: this.room.config.bots.length,
      playerNames: Array.from({ length: this.room.config.humanSlots }, (_, slotIndex) =>
        this.room.participants.find((participant) => participant.slotIndex === slotIndex)?.name
        ?? `Игрок ${slotIndex + 1}`
      ),
      difficultyLevel: this.room.config.difficultyLevel,
      gameMode: this.room.config.gameMode,
    };
  }

  start(): void {
    if (this.timer || this.fastForwarding) return;
    this.options.onSnapshot(this.createSnapshot());
    this.timer = setInterval(() => this.processTick(), this.tickIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fastForwardHandle) {
      clearImmediate(this.fastForwardHandle);
      this.fastForwardHandle = null;
    }
    if (this.completionDelayTimer) {
      clearTimeout(this.completionDelayTimer);
      this.completionDelayTimer = null;
    }
    this.fastForwarding = false;
  }

  startNextRound(room: RoomSnapshotDTO): void {
    if (this.createSnapshot().status !== 'round-complete') {
      throw new MatchSessionError('ROUND_NOT_COMPLETE', 'Current round has not completed');
    }
    if (room.status !== 'playing' || room.currentRound !== this.state.level + 1) {
      throw new MatchSessionError('INVALID_NEXT_ROUND', 'Room does not describe the next playing round');
    }
    const previousState = this.state;
    this.closeChangedControlPeriods(room);
    this.room = room;
    this.state = this.engine.createGameState(this.createGameConfig(), room.currentRound);
    this.engine.initLevel(this.state, this.createGameConfig());
    this.syncParticipants();
    this.applyParticipantControllerStates();
    for (let snakeIndex = 0; snakeIndex < this.state.snakes.length; snakeIndex++) {
      const previousSnake = previousState.snakes[snakeIndex];
      const nextSnake = this.state.snakes[snakeIndex];
      if (!previousSnake || !nextSnake) continue;
      nextSnake.score = previousSnake.score;
      nextSnake.levelsWon = previousSnake.levelsWon;
    }
    this.openMissingControlPeriods();
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
    if (this.state.levelComplete || this.state.gameOver) {
      throw new MatchSessionError('MATCH_NOT_ACTIVE', 'Direction commands require an active round');
    }
    const participant = this.participantsById.get(playerId);
    if (!participant || command.playerId !== playerId) {
      throw new MatchSessionError('PLAYER_MISMATCH', 'Direction command does not belong to this connection');
    }
    const snake = this.state.snakes[participant.slotIndex];
    if (!snake || snake.isBot || snake.movementPaused) {
      throw new MatchSessionError('PLAYER_CONTROL_UNAVAILABLE', 'Player does not currently control a moving snake');
    }
    const pendingSequence = this.pendingInputs.get(playerId)?.sequence ?? -1;
    const acknowledgedSequence = this.acknowledgedInputs[playerId] ?? -1;
    if (command.sequence <= Math.max(pendingSequence, acknowledgedSequence)) return;
    this.pendingInputs.set(playerId, command);
  }

  fastForwardRound(playerId: string, command: FastForwardRoundMessage): void {
    if (command.matchId !== this.matchId) {
      throw new MatchSessionError('MATCH_NOT_FOUND', 'Fast-forward command targets another match');
    }
    const participant = this.room.participants.find((item) => item.playerId === playerId);
    if (!participant || command.playerId !== playerId || participant.status === 'replaced-by-bot') {
      throw new MatchSessionError('PLAYER_MISMATCH', 'Fast-forward command does not belong to this connection');
    }
    if (this.fastForwarding) return;

    const humanSnakes = this.room.participants
      .filter((item) => item.status !== 'replaced-by-bot')
      .map((item) => this.state.snakes[item.slotIndex])
      .filter((snake) => snake !== undefined);
    const hasAliveBot = this.state.snakes.some((snake) => snake.isBot && snake.alive);
    if (
      this.state.levelComplete
      || this.state.gameOver
      || humanSnakes.length === 0
      || humanSnakes.some((snake) => snake.alive)
      || !hasAliveBot
    ) {
      throw new MatchSessionError(
        'FAST_FORWARD_UNAVAILABLE',
        'Fast-forward requires all human snakes to be dead and at least one bot to be alive'
      );
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pendingInputs.clear();
    this.fastForwarding = true;
    const startedAt = performance.now();
    this.runFastForwardBatch(startedAt, 1000);
  }

  pausePlayer(room: RoomSnapshotDTO, playerId: string): void {
    const snake = this.requireParticipantSnake(playerId);
    this.closeControlPeriod(snake.id);
    this.room = room;
    if (!snake.isBot && snake.alive) snake.movementPaused = true;
    this.pendingInputs.delete(playerId);
  }

  restorePlayer(room: RoomSnapshotDTO, playerId: string): void {
    this.room = room;
    const snake = this.requireParticipantSnake(playerId);
    if (snake.isBot) {
      throw new MatchSessionError('PLAYER_CONTROL_UNAVAILABLE', 'Player control has already passed to a bot');
    }
    snake.movementPaused = false;
    this.openControlPeriod(snake.id, 'human', playerId, snake.name);
  }

  replacePlayerWithBot(room: RoomSnapshotDTO, playerId: string): void {
    const snake = this.requireParticipantSnake(playerId);
    this.closeControlPeriod(snake.id);
    this.room = room;
    snake.isBot = true;
    snake.movementPaused = false;
    this.replacementBotSnakeIds.add(snake.id);
    this.pendingInputs.delete(playerId);
    this.openControlPeriod(snake.id, 'bot', `bot:${snake.id}`, snake.name);
  }

  processTick(): GameSnapshotDTO {
    const snapshot = this.advanceState();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  private advanceState(): GameSnapshotDTO {
    this.applyBotDirections();
    for (const [playerId, command] of this.pendingInputs) {
      const participant = this.participantsById.get(playerId);
      const snake = participant ? this.state.snakes[participant.slotIndex] : undefined;
      if (snake?.alive) applyDirection(snake, command.direction);
      this.acknowledgedInputs[playerId] = command.sequence;
    }
    this.pendingInputs.clear();

    const tickResult = this.engine.processTick(this.state);
    this.totalTicks++;
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
    return this.createSnapshot();
  }

  private publishSnapshot(snapshot: GameSnapshotDTO): void {
    this.options.onSnapshot(snapshot);
    if (snapshot.status === 'playing') return;
    if (snapshot.status === 'game-complete') this.completeHistory();
    const completedByFastForward = this.fastForwarding;
    this.stop();
    if (!completedByFastForward) {
      this.options.onComplete?.(snapshot);
      return;
    }
    this.completionDelayTimer = setTimeout(() => {
      this.completionDelayTimer = null;
      this.options.onComplete?.(snapshot);
    }, FAST_FORWARD_FINAL_FRAME_MS);
    this.completionDelayTimer.unref();
  }

  private runFastForwardBatch(startedAt: number, nextDifficultyIncreaseAt: number): void {
    const batchStartedAt = performance.now();
    let snapshot = this.createSnapshot();
    while (
      snapshot.status === 'playing'
      && performance.now() - batchStartedAt < FAST_FORWARD_BATCH_BUDGET_MS
    ) {
      snapshot = this.advanceState();
    }

    if (snapshot.status !== 'playing') {
      this.publishSnapshot(snapshot);
      return;
    }

    const elapsedMs = performance.now() - startedAt;
    let nextRenderAt = nextDifficultyIncreaseAt;
    while (elapsedMs >= nextRenderAt) {
      this.options.onSnapshot(snapshot);
      this.state.difficultyLevel = Math.min(10, this.state.difficultyLevel + 1);
      nextRenderAt += 1000;
    }

    this.fastForwardHandle = setImmediate(() => {
      this.fastForwardHandle = null;
      if (this.fastForwarding) this.runFastForwardBatch(startedAt, nextRenderAt);
    });
  }

  private applyBotDirections(): void {
    const settings = this.engine.getSettings();
    for (const snake of this.state.snakes) {
      if (!snake.isBot || !snake.alive) continue;
      const decisionState = this.replacementBotSnakeIds.has(snake.id)
        ? { ...this.state, difficultyLevel: 5 }
        : this.state;
      applyDirection(snake, chooseDirectionByDifficulty(decisionState, snake, settings));
    }
  }

  private applyParticipantControllerStates(): void {
    this.replacementBotSnakeIds.clear();
    for (const participant of this.room.participants) {
      const snake = this.state.snakes[participant.slotIndex];
      if (!snake) continue;
      if (participant.status === 'replaced-by-bot') {
        snake.isBot = true;
        snake.movementPaused = false;
        this.replacementBotSnakeIds.add(snake.id);
      } else {
        snake.name = participant.name;
        snake.isBot = false;
        snake.movementPaused = participant.status === 'reconnecting';
      }
    }
  }

  private closeChangedControlPeriods(nextRoom: RoomSnapshotDTO): void {
    for (const [slotIndex, activePeriod] of this.activeControlPeriods) {
      const nextParticipant = nextRoom.participants.find((participant) =>
        participant.slotIndex === slotIndex && participant.status !== 'replaced-by-bot'
      );
      const nextControllerId = nextParticipant?.playerId ?? `bot:${slotIndex}`;
      const nextControllerType: SnakeControllerType = nextParticipant ? 'human' : 'bot';
      if (
        activePeriod.controllerId !== nextControllerId
        || activePeriod.controllerType !== nextControllerType
      ) {
        this.closeControlPeriod(slotIndex);
      }
    }
  }

  private openMissingControlPeriods(): void {
    for (const snake of this.state.snakes) {
      if (this.activeControlPeriods.has(snake.id)) continue;
      const controller = this.createController(snake.id, snake.name, snake.isBot);
      this.openControlPeriod(
        snake.id,
        controller.type,
        controller.controllerId,
        controller.displayName
      );
    }
  }

  private openControlPeriod(
    slotIndex: number,
    controllerType: SnakeControllerType,
    controllerId: string,
    displayName: string
  ): void {
    if (this.activeControlPeriods.has(slotIndex)) return;
    const snake = this.state.snakes[slotIndex];
    if (!snake) return;
    this.activeControlPeriods.set(slotIndex, {
      controllerType,
      controllerId,
      displayName,
      startedAtTick: this.totalTicks,
      scoreAtStart: snake.score,
    });
  }

  private closeControlPeriod(slotIndex: number): void {
    const activePeriod = this.activeControlPeriods.get(slotIndex);
    const snake = this.state.snakes[slotIndex];
    if (!activePeriod || !snake) return;
    const history = this.controllerHistories.get(activePeriod.controllerId) ?? {
      displayName: activePeriod.displayName,
      controlPeriods: [],
    };
    history.displayName = activePeriod.displayName;
    history.controlPeriods.push({
      controllerType: activePeriod.controllerType,
      controllerId: activePeriod.controllerId,
      startedAtTick: activePeriod.startedAtTick,
      endedAtTick: this.totalTicks,
      scoreGained: snake.score - activePeriod.scoreAtStart,
    });
    this.controllerHistories.set(activePeriod.controllerId, history);
    this.activeControlPeriods.delete(slotIndex);
  }

  private completeHistory(): void {
    if (this.completedHistory) return;
    for (const slotIndex of [...this.activeControlPeriods.keys()]) {
      this.closeControlPeriod(slotIndex);
    }
    this.completedHistory = {
      matchId: this.matchId,
      roomName: this.room.config.name,
      startedAt: this.startedAt,
      finishedAt: new Date(this.now()).toISOString(),
      participants: [...this.controllerHistories.entries()].map(([controllerId, history]) => ({
        controllerId,
        displayName: history.displayName,
        personalScore: history.controlPeriods.reduce((sum, period) => sum + period.scoreGained, 0),
        controlPeriods: history.controlPeriods.map((period) => ({ ...period })),
      })),
    };
    const history = this.getHistory();
    if (history) this.options.onHistoryReady?.(history);
  }

  getHistory(): MatchHistoryDTO | null {
    if (!this.completedHistory) return null;
    return {
      ...this.completedHistory,
      participants: this.completedHistory.participants.map((participant) => ({
        ...participant,
        controlPeriods: participant.controlPeriods.map((period) => ({ ...period })),
      })),
    };
  }

  private syncParticipants(): void {
    this.participantsById.clear();
    const currentPlayerIds = new Set<string>();
    for (const participant of this.room.participants) {
      this.participantsById.set(participant.playerId, participant);
      currentPlayerIds.add(participant.playerId);
      if (this.acknowledgedInputs[participant.playerId] === undefined) {
        this.acknowledgedInputs[participant.playerId] = -1;
      }
    }
    for (const playerId of Object.keys(this.acknowledgedInputs)) {
      if (!currentPlayerIds.has(playerId)) delete this.acknowledgedInputs[playerId];
    }
  }

  private requireParticipantSnake(playerId: string) {
    const participant = this.participantsById.get(playerId);
    const snake = participant ? this.state.snakes[participant.slotIndex] : undefined;
    if (!participant || !snake) {
      throw new MatchSessionError('PLAYER_NOT_FOUND', 'Player does not own a snake in this match');
    }
    return snake;
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
      fastForwarding: this.fastForwarding,
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
        facing: food.facing,
      })),
      enemies: this.state.enemies.map((enemy) => ({
        enemyId: enemy.id,
        kind: enemy.kind,
        position: { ...enemy.pos },
        width: enemy.width,
        height: enemy.height,
        facing: enemy.facing,
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
