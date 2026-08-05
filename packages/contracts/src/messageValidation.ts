import {
  NETWORK_PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from './messages';
import { validateRoomConfig } from './roomContracts';

export interface ClientMessageParseSuccess {
  ok: true;
  message: ClientMessage;
}

export interface ClientMessageParseFailure {
  ok: false;
  code: 'INVALID_JSON' | 'INVALID_MESSAGE' | 'UNSUPPORTED_PROTOCOL_VERSION';
  message: string;
}

export type ClientMessageParseResult = ClientMessageParseSuccess | ClientMessageParseFailure;

export interface ServerMessageParseSuccess {
  ok: true;
  message: ServerMessage;
}

export interface ServerMessageParseFailure {
  ok: false;
  code: 'INVALID_JSON' | 'INVALID_MESSAGE' | 'UNSUPPORTED_PROTOCOL_VERSION';
  message: string;
}

export type ServerMessageParseResult = ServerMessageParseSuccess | ServerMessageParseFailure;

/** Parse and validate a JSON message received from an untrusted WebSocket client. */
export function parseClientMessageText(text: string): ClientMessageParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure('INVALID_JSON', 'Message must contain valid JSON');
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    return failure('INVALID_MESSAGE', 'Message type is required');
  }
  if (value.protocolVersion !== NETWORK_PROTOCOL_VERSION) {
    return failure('UNSUPPORTED_PROTOCOL_VERSION', `Protocol version ${NETWORK_PROTOCOL_VERSION} is required`);
  }

  switch (value.type) {
    case 'handshake':
      return success(value as unknown as ClientMessage);
    case 'join-room':
      if (
        !isNonEmptyString(value.playerName)
        || (value.roomId === undefined && value.privateCode === undefined)
        || (value.roomId !== undefined && !isNonEmptyString(value.roomId))
        || (value.privateCode !== undefined && !isNonEmptyString(value.privateCode))
      ) {
        return failure('INVALID_MESSAGE', 'Join room fields are invalid');
      }
      return success(value as unknown as ClientMessage);
    case 'reconnect':
      if (!isNonEmptyString(value.roomId) || !isNonEmptyString(value.reconnectToken)) {
        return failure('INVALID_MESSAGE', 'Reconnect fields are invalid');
      }
      return success(value as unknown as ClientMessage);
    case 'set-ready':
      if (typeof value.ready !== 'boolean') {
        return failure('INVALID_MESSAGE', 'Ready status must be boolean');
      }
      return success(value as unknown as ClientMessage);
    case 'direction':
      if (!isValidDirectionMessage(value)) {
        return failure('INVALID_MESSAGE', 'Direction command fields are invalid');
      }
      return success(value as unknown as ClientMessage);
    case 'leave-match':
      return success(value as unknown as ClientMessage);
    default:
      return failure('INVALID_MESSAGE', `Unknown message type: ${value.type}`);
  }
}

/** Parse and validate a JSON message received from an untrusted multiplayer server. */
export function parseServerMessageText(text: string): ServerMessageParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return serverFailure('INVALID_JSON', 'Message must contain valid JSON');
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    return serverFailure('INVALID_MESSAGE', 'Message type is required');
  }
  if (value.protocolVersion !== NETWORK_PROTOCOL_VERSION) {
    return serverFailure(
      'UNSUPPORTED_PROTOCOL_VERSION',
      `Protocol version ${NETWORK_PROTOCOL_VERSION} is required`
    );
  }

  switch (value.type) {
    case 'connected':
      return isNonEmptyString(value.connectionId)
        ? serverSuccess(value as unknown as ServerMessage)
        : serverFailure('INVALID_MESSAGE', 'Connection id is required');
    case 'room-joined':
      return isRoomSnapshot(value.room)
        && isNonEmptyString(value.playerId)
        && isNonEmptyString(value.reconnectToken)
        ? serverSuccess(value as unknown as ServerMessage)
        : serverFailure('INVALID_MESSAGE', 'Joined room fields are invalid');
    case 'room-state':
      return isRoomSnapshot(value.room)
        ? serverSuccess(value as unknown as ServerMessage)
        : serverFailure('INVALID_MESSAGE', 'Room state is invalid');
    case 'game-state':
      return isGameSnapshot(value.snapshot)
        ? serverSuccess(value as unknown as ServerMessage)
        : serverFailure('INVALID_MESSAGE', 'Game snapshot is invalid');
    case 'error':
      return isNonEmptyString(value.code) && isNonEmptyString(value.message)
        ? serverSuccess(value as unknown as ServerMessage)
        : serverFailure('INVALID_MESSAGE', 'Protocol error fields are invalid');
    default:
      return serverFailure('INVALID_MESSAGE', `Unknown message type: ${value.type}`);
  }
}

function isValidDirectionMessage(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.matchId)
    && isNonEmptyString(value.playerId)
    && typeof value.sequence === 'number'
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 0
    && (value.direction === 'up'
      || value.direction === 'down'
      || value.direction === 'left'
      || value.direction === 'right');
}

function success(message: ClientMessage): ClientMessageParseSuccess {
  return { ok: true, message };
}

function failure(code: ClientMessageParseFailure['code'], message: string): ClientMessageParseFailure {
  return { ok: false, code, message };
}

function serverSuccess(message: ServerMessage): ServerMessageParseSuccess {
  return { ok: true, message };
}

function serverFailure(
  code: ServerMessageParseFailure['code'],
  message: string
): ServerMessageParseFailure {
  return { ok: false, code, message };
}

function isRoomSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.roomId) || !isRoomStatus(value.status)) {
    return false;
  }
  if (!Number.isSafeInteger(value.currentRound) || !validateRoomConfig(value.config).valid) {
    return false;
  }
  return Array.isArray(value.participants) && value.participants.every((participant) =>
    isRecord(participant)
    && isNonEmptyString(participant.playerId)
    && typeof participant.name === 'string'
    && Number.isSafeInteger(participant.slotIndex)
    && typeof participant.isCreator === 'boolean'
    && isParticipantStatus(participant.status)
  );
}

function isGameSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.protocolVersion === NETWORK_PROTOCOL_VERSION
    && isNonEmptyString(value.matchId)
    && isFiniteNumber(value.serverTimeMs)
    && isNonNegativeInteger(value.tick)
    && isFiniteNumber(value.tickIntervalMs)
    && isRecord(value.acknowledgedInputByPlayer)
    && Object.values(value.acknowledgedInputByPlayer).every(isSafeInteger)
    && isRoomStatus(value.status)
    && isNonNegativeInteger(value.level)
    && isFiniteNumber(value.levelTimeLeft)
    && isFiniteNumber(value.difficultyLevel)
    && isNonNegativeInteger(value.width)
    && isNonNegativeInteger(value.height)
    && Array.isArray(value.snakes)
    && value.snakes.every(isSnakeSnapshot)
    && Array.isArray(value.foods)
    && value.foods.every(isFoodSnapshot)
    && Array.isArray(value.enemies)
    && value.enemies.every(isEnemySnapshot)
    && Array.isArray(value.walls)
    && value.walls.every(isPosition);
}

function isSnakeSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.controller)) return false;
  return isNonNegativeInteger(value.snakeId)
    && isNonNegativeInteger(value.slotIndex)
    && Array.isArray(value.segments)
    && value.segments.every(isPosition)
    && isDirection(value.direction)
    && typeof value.alive === 'boolean'
    && isFiniteNumber(value.score)
    && isFiniteNumber(value.levelsWon)
    && isFiniteNumber(value.ticksWithoutFood)
    && (value.deathReason === undefined || typeof value.deathReason === 'string')
    && (value.controller.type === 'human' || value.controller.type === 'bot')
    && isNonEmptyString(value.controller.controllerId)
    && typeof value.controller.displayName === 'string'
    && typeof value.controller.connected === 'boolean';
}

function isFoodSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isPosition(value.position)
    && (value.kind === 'apple' || value.kind === 'rabbit' || value.kind === 'chicken' || value.kind === 'meat')
    && isFiniteNumber(value.age)
    && (value.facing === undefined || value.facing === 'left' || value.facing === 'right');
}

function isEnemySnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.enemyId)
    && value.kind === 'hedgehog'
    && isPosition(value.position)
    && isNonNegativeInteger(value.width)
    && isNonNegativeInteger(value.height)
    && (value.facing === 'left' || value.facing === 'right');
}

function isPosition(value: unknown): boolean {
  return isRecord(value) && isSafeInteger(value.x) && isSafeInteger(value.y);
}

function isRoomStatus(value: unknown): boolean {
  return value === 'waiting' || value === 'playing' || value === 'round-complete' || value === 'game-complete';
}

function isParticipantStatus(value: unknown): boolean {
  return value === 'connected' || value === 'ready' || value === 'reconnecting' || value === 'replaced-by-bot';
}

function isDirection(value: unknown): boolean {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
