export const MAX_NETWORK_PARTICIPANTS = 6;
export const MIN_NETWORK_HUMAN_SLOTS = 1;
export const MAX_ROOM_NAME_LENGTH = 50;

export type RoomVisibility = 'public' | 'private';
export type NetworkGameMode = 'classic' | 'survival';
export type RoomLifecycleStatus = 'waiting' | 'playing' | 'round-complete' | 'game-complete';
export type ParticipantConnectionStatus = 'connected' | 'ready' | 'reconnecting' | 'replaced-by-bot';

export interface NetworkBotSlotConfig {
  replaceableByPlayerBetweenRounds: boolean;
}

export interface RoomConfigDTO {
  name: string;
  visibility: RoomVisibility;
  humanSlots: number;
  bots: NetworkBotSlotConfig[];
  difficultyLevel: number;
  gameMode: NetworkGameMode;
}

export interface RoomParticipantDTO {
  playerId: string;
  name: string;
  slotIndex: number;
  isCreator: boolean;
  status: ParticipantConnectionStatus;
}

export interface RoomSnapshotDTO {
  roomId: string;
  config: RoomConfigDTO;
  status: RoomLifecycleStatus;
  participants: RoomParticipantDTO[];
  currentRound: number;
}

export interface PublicRoomSummaryDTO {
  roomId: string;
  name: string;
  humanSlots: number;
  connectedHumans: number;
  botSlots: number;
  replaceableBotSlots: number;
  status: RoomLifecycleStatus;
  canJoin: boolean;
}

export interface CreateRoomRequestDTO {
  config: RoomConfigDTO;
  creatorName: string;
}

export interface CreateRoomResponseDTO {
  room: RoomSnapshotDTO;
  playerId: string;
  reconnectToken: string;
  privateCode?: string;
}

export interface RoomConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate an untrusted room configuration before creating a match room. */
export function validateRoomConfig(value: unknown): RoomConfigValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['Room config must be an object'] };
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    errors.push('Room name is required');
  } else if (value.name.trim().length > MAX_ROOM_NAME_LENGTH) {
    errors.push(`Room name must not exceed ${MAX_ROOM_NAME_LENGTH} characters`);
  }

  if (value.visibility !== 'public' && value.visibility !== 'private') {
    errors.push('Room visibility must be public or private');
  }

  if (!isIntegerInRange(value.humanSlots, MIN_NETWORK_HUMAN_SLOTS, MAX_NETWORK_PARTICIPANTS)) {
    errors.push(`Human slots must be between ${MIN_NETWORK_HUMAN_SLOTS} and ${MAX_NETWORK_PARTICIPANTS}`);
  }

  if (!Array.isArray(value.bots)) {
    errors.push('Bots must be an array');
  } else {
    for (const bot of value.bots) {
      if (!isRecord(bot) || typeof bot.replaceableByPlayerBetweenRounds !== 'boolean') {
        errors.push('Every bot slot must define replaceableByPlayerBetweenRounds');
        break;
      }
    }
  }

  if (
    typeof value.humanSlots === 'number'
    && Array.isArray(value.bots)
    && value.humanSlots + value.bots.length > MAX_NETWORK_PARTICIPANTS
  ) {
    errors.push(`Human and bot slots must not exceed ${MAX_NETWORK_PARTICIPANTS}`);
  }

  if (!isIntegerInRange(value.difficultyLevel, 1, 10)) {
    errors.push('Difficulty level must be between 1 and 10');
  }

  if (value.gameMode !== 'classic' && value.gameMode !== 'survival') {
    errors.push('Game mode must be classic or survival');
  }

  return { valid: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
