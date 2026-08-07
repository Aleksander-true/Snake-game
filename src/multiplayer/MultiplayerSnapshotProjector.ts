import type {
  GameSnapshotDTO,
  NetworkDirection,
} from '@snake-game/contracts';
import {
  AppleFoodEntity,
  ChickenFoodEntity,
  createEmptyBoard,
  HedgehogEntity,
  MeatFoodEntity,
  RabbitFoodEntity,
  SnakeEntity,
  type Food,
  type GameMode,
  type GameState,
} from '@snake-game/core';

interface PendingDirection {
  sequence: number;
  direction: NetworkDirection;
}

/** Converts authoritative snapshots into render state and reapplies unacknowledged local input. */
export class MultiplayerSnapshotProjector {
  private snapshot: GameSnapshotDTO | null = null;
  private playerId = '';
  private gameMode: GameMode = 'classic';
  private pendingDirections: PendingDirection[] = [];

  reconcile(snapshot: GameSnapshotDTO, playerId: string, gameMode: GameMode): GameState {
    if (this.snapshot?.matchId !== snapshot.matchId) this.pendingDirections = [];
    this.snapshot = snapshot;
    this.playerId = playerId;
    this.gameMode = gameMode;
    const acknowledgedSequence = snapshot.acknowledgedInputByPlayer[playerId] ?? -1;
    this.pendingDirections = this.pendingDirections.filter(
      (command) => command.sequence > acknowledgedSequence
    );
    return this.project();
  }

  predict(sequence: number, direction: NetworkDirection): GameState | null {
    if (!this.snapshot || this.snapshot.status !== 'playing') return null;
    this.pendingDirections.push({ sequence, direction });
    return this.project();
  }

  reset(): void {
    this.snapshot = null;
    this.playerId = '';
    this.pendingDirections = [];
  }

  private project(): GameState {
    const snapshot = this.requireSnapshot();
    const state = snapshotToGameState(snapshot, this.gameMode);
    const localSnakeId = snapshot.snakes.find(
      (source) => source.controller.controllerId === this.playerId
    )?.snakeId;
    const localSnake = state.snakes.find((snake) => snake.id === localSnakeId);
    const latestDirection = this.pendingDirections[this.pendingDirections.length - 1]?.direction;
    if (localSnake?.alive && latestDirection) {
      localSnake.applyDirection(latestDirection);
      localSnake.move(false);
    }
    return state;
  }

  private requireSnapshot(): GameSnapshotDTO {
    if (!this.snapshot) throw new Error('Server snapshot is not available');
    return this.snapshot;
  }
}

/** Creates domain-shaped data for existing renderers without advancing the client-side Engine. */
export function snapshotToGameState(snapshot: GameSnapshotDTO, gameMode: GameMode): GameState {
  return {
    board: createEmptyBoard(snapshot.width, snapshot.height),
    width: snapshot.width,
    height: snapshot.height,
    snakes: snapshot.snakes.map((source) => {
      const snake = new SnakeEntity(
        source.snakeId,
        source.controller.displayName,
        source.segments.map((segment) => ({ ...segment })),
        source.direction,
        source.controller.type === 'bot'
      );
      snake.alive = source.alive;
      snake.score = source.score;
      snake.levelsWon = source.levelsWon;
      snake.ticksWithoutFood = source.ticksWithoutFood;
      snake.movementPaused = !source.controller.connected;
      snake.deathReason = source.deathReason;
      return snake;
    }),
    foods: snapshot.foods.map(createFood),
    enemies: snapshot.enemies.map((source) => new HedgehogEntity(
      source.enemyId,
      { ...source.position },
      source.width,
      source.height,
      source.facing
    )),
    targetHedgehogCount: snapshot.enemies.length,
    roundResults: [],
    walls: snapshot.walls.map((wall) => ({ ...wall })),
    level: snapshot.level,
    gameMode,
    difficultyLevel: snapshot.difficultyLevel,
    tickCount: snapshot.tick,
    lastAutoFoodSpawnTick: snapshot.tick,
    levelTimeLeft: snapshot.levelTimeLeft,
    gameOver: snapshot.status === 'game-complete',
    levelComplete: snapshot.status === 'round-complete' || snapshot.status === 'game-complete',
  };
}

function createFood(source: GameSnapshotDTO['foods'][number], index: number): Food {
  const position = { ...source.position };
  const id = `network-food-${index}`;
  switch (source.kind) {
    case 'apple':
      return new AppleFoodEntity(position, source.age, source.age, 0, id);
    case 'rabbit':
      return new RabbitFoodEntity(position, source.age, source.age, 0, id);
    case 'chicken':
      return new ChickenFoodEntity(
        position,
        source.age,
        source.age,
        0,
        position,
        0,
        false,
        id,
        source.facing
      );
    case 'meat':
      return new MeatFoodEntity(position, source.age, id);
  }
}
