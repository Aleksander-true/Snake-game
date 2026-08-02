import type { NetworkDirection, GameSnapshotDTO } from './gameContracts';
import type { RoomSnapshotDTO } from './roomContracts';

export const NETWORK_PROTOCOL_VERSION = 1;
export const MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES = 16 * 1024;
export const HEARTBEAT_INTERVAL_MS = 2000;
export const HEARTBEAT_TIMEOUT_MS = 5000;
export const RECONNECT_WINDOW_MS = 10_000;

interface ProtocolMessage {
  protocolVersion: number;
  type: string;
}

export interface HandshakeMessage extends ProtocolMessage {
  type: 'handshake';
}

export interface JoinRoomMessage extends ProtocolMessage {
  type: 'join-room';
  roomId?: string;
  privateCode?: string;
  playerName: string;
}

export interface ReconnectMessage extends ProtocolMessage {
  type: 'reconnect';
  roomId: string;
  reconnectToken: string;
}

export interface SetReadyMessage extends ProtocolMessage {
  type: 'set-ready';
  ready: boolean;
}

export interface DirectionCommandMessage extends ProtocolMessage {
  type: 'direction';
  matchId: string;
  playerId: string;
  sequence: number;
  direction: NetworkDirection;
}

export interface LeaveMatchMessage extends ProtocolMessage {
  type: 'leave-match';
}

export type ClientMessage =
  | HandshakeMessage
  | JoinRoomMessage
  | ReconnectMessage
  | SetReadyMessage
  | DirectionCommandMessage
  | LeaveMatchMessage;

export interface ConnectedMessage extends ProtocolMessage {
  type: 'connected';
  connectionId: string;
}

export interface RoomStateMessage extends ProtocolMessage {
  type: 'room-state';
  room: RoomSnapshotDTO;
}

export interface GameStateMessage extends ProtocolMessage {
  type: 'game-state';
  snapshot: GameSnapshotDTO;
}

export interface ProtocolErrorMessage extends ProtocolMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ServerMessage = ConnectedMessage | RoomStateMessage | GameStateMessage | ProtocolErrorMessage;
