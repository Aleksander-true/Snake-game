import {
  NETWORK_PROTOCOL_VERSION,
  type ClientMessage,
} from './messages';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
