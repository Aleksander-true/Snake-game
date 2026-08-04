import type { RoomLifecycleStatus } from './roomContracts';

export type NetworkDirection = 'up' | 'down' | 'left' | 'right';
export type NetworkFoodKind = 'apple' | 'rabbit' | 'chicken' | 'meat';
export type NetworkFoodFacing = 'left' | 'right';
export type NetworkEnemyKind = 'hedgehog';
export type SnakeControllerType = 'human' | 'bot';

export interface PositionDTO {
  x: number;
  y: number;
}

export interface SnakeControllerDTO {
  type: SnakeControllerType;
  controllerId: string;
  displayName: string;
  connected: boolean;
}

export interface SnakeSnapshotDTO {
  snakeId: number;
  slotIndex: number;
  segments: PositionDTO[];
  direction: NetworkDirection;
  alive: boolean;
  score: number;
  levelsWon: number;
  ticksWithoutFood: number;
  deathReason?: string;
  controller: SnakeControllerDTO;
}

export interface FoodSnapshotDTO {
  position: PositionDTO;
  kind: NetworkFoodKind;
  age: number;
  facing?: NetworkFoodFacing;
}

export interface EnemySnapshotDTO {
  enemyId: string;
  kind: NetworkEnemyKind;
  position: PositionDTO;
  width: number;
  height: number;
  facing: NetworkFoodFacing;
}

export interface GameSnapshotDTO {
  protocolVersion: number;
  matchId: string;
  serverTimeMs: number;
  tick: number;
  tickIntervalMs: number;
  acknowledgedInputByPlayer: Record<string, number>;
  status: RoomLifecycleStatus;
  level: number;
  levelTimeLeft: number;
  difficultyLevel: number;
  width: number;
  height: number;
  snakes: SnakeSnapshotDTO[];
  foods: FoodSnapshotDTO[];
  enemies: EnemySnapshotDTO[];
  walls: PositionDTO[];
}

export interface ControlPeriodDTO {
  controllerType: SnakeControllerType;
  controllerId: string;
  startedAtTick: number;
  endedAtTick?: number;
  scoreGained: number;
}

export interface MatchHistoryParticipantDTO {
  controllerId: string;
  displayName: string;
  personalScore: number;
  controlPeriods: ControlPeriodDTO[];
}

export interface MatchHistoryDTO {
  matchId: string;
  roomName: string;
  startedAt: string;
  finishedAt: string;
  participants: MatchHistoryParticipantDTO[];
}
