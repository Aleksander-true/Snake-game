import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES,
  NETWORK_PROTOCOL_VERSION,
  parseClientMessageText,
  type CreateRoomRequestDTO,
  type ClientMessage,
  type GameStateMessage,
  type ProtocolErrorMessage,
  type RoomStateMessage,
} from '@snake-game/contracts';
import { RoomRegistry, RoomRegistryError } from './multiplayer/RoomRegistry';
import { MatchSession, MatchSessionError } from './multiplayer/MatchSession';

export interface ClientConnection {
  connectionId: string;
  socket: WebSocket;
}

export interface MultiplayerServerOptions {
  onClientMessage?: (connection: ClientConnection, message: Exclude<ClientMessage, { type: 'handshake' }>) => void;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

export interface MultiplayerServer {
  app: Express;
  httpServer: HttpServer;
  webSocketServer: WebSocketServer;
  rooms: RoomRegistry;
  start(port?: number, host?: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface ConnectionState {
  connectionId: string;
  handshakeComplete: boolean;
  lastSeenAt: number;
  roomId?: string;
  playerId?: string;
}

export function createMultiplayerServer(options: MultiplayerServerOptions = {}): MultiplayerServer {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES }));
  const rooms = new RoomRegistry();
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', protocolVersion: NETWORK_PROTOCOL_VERSION });
  });
  app.get('/api/rooms', (_request, response) => {
    response.json(rooms.listPublicRooms());
  });
  app.post('/api/rooms', (request, response) => {
    try {
      const created = rooms.createRoom(request.body as CreateRoomRequestDTO);
      response.status(201).json(created);
    } catch (error) {
      sendHttpError(response, error);
    }
  });

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES,
  });
  const connectionStates = new Map<WebSocket, ConnectionState>();
  const matchSessions = new Map<string, MatchSession>();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  });

  webSocketServer.on('connection', (socket) => {
    const state: ConnectionState = {
      connectionId: randomUUID(),
      handshakeComplete: false,
      lastSeenAt: Date.now(),
    };
    connectionStates.set(socket, state);

    socket.on('pong', () => {
      state.lastSeenAt = Date.now();
    });
    socket.on('message', (data, isBinary) => {
      state.lastSeenAt = Date.now();
      if (isBinary) {
        rejectConnection(socket, 'INVALID_MESSAGE', 'Binary messages are not supported');
        return;
      }

      const parsed = parseClientMessageText(data.toString());
      if (!parsed.ok) {
        rejectConnection(socket, parsed.code, parsed.message);
        return;
      }
      if (!state.handshakeComplete) {
        if (parsed.message.type !== 'handshake') {
          rejectConnection(socket, 'HANDSHAKE_REQUIRED', 'Handshake must be the first message');
          return;
        }
        state.handshakeComplete = true;
        sendJson(socket, {
          protocolVersion: NETWORK_PROTOCOL_VERSION,
          type: 'connected',
          connectionId: state.connectionId,
        });
        return;
      }
      if (parsed.message.type === 'handshake') {
        sendProtocolError(socket, 'HANDSHAKE_ALREADY_COMPLETED', 'Handshake is already complete');
        return;
      }
      options.onClientMessage?.(
        { connectionId: state.connectionId, socket },
        parsed.message,
      );
      try {
        if (parsed.message.type === 'join-room') {
          const joined = rooms.joinRoom(parsed.message);
          state.roomId = joined.room.roomId;
          state.playerId = joined.playerId;
          sendJson(socket, {
            protocolVersion: NETWORK_PROTOCOL_VERSION,
            type: 'room-joined',
            ...joined,
          });
          broadcastRoomState(joined.room.roomId, joined.room);
          return;
        }
        if (parsed.message.type === 'reconnect') {
          const joined = rooms.reconnect(parsed.message.roomId, parsed.message.reconnectToken);
          state.roomId = joined.room.roomId;
          state.playerId = joined.playerId;
          sendJson(socket, {
            protocolVersion: NETWORK_PROTOCOL_VERSION,
            type: 'room-joined',
            ...joined,
          });
          broadcastRoomState(joined.room.roomId, joined.room);
          return;
        }
        if (parsed.message.type === 'set-ready') {
          if (!state.roomId || !state.playerId) {
            throw new RoomRegistryError('ROOM_JOIN_REQUIRED', 'Join a room before changing ready status');
          }
          const snapshot = rooms.setReady(state.roomId, state.playerId, parsed.message.ready);
          broadcastRoomState(state.roomId, snapshot);
          if (rooms.isReadyToStart(state.roomId)) {
            const session = matchSessions.get(state.roomId);
            if (session) {
              const room = rooms.startRound(state.roomId);
              broadcastRoomState(state.roomId, room);
              session.startNextRound(room);
            } else {
              startRoomMatch(state.roomId);
            }
          }
          return;
        }
        if (parsed.message.type === 'direction') {
          if (!state.roomId || !state.playerId) {
            throw new RoomRegistryError('ROOM_JOIN_REQUIRED', 'Join a room before sending direction commands');
          }
          const session = matchSessions.get(state.roomId);
          if (!session) throw new MatchSessionError('MATCH_NOT_FOUND', 'No active match exists for this room');
          session.enqueueDirection(state.playerId, parsed.message);
          return;
        }
      } catch (error) {
        sendRoomError(socket, error);
        return;
      }
    });
    socket.on('close', () => {
      connectionStates.delete(socket);
    });
  });

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [socket, state] of connectionStates) {
      if (now - state.lastSeenAt > (options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS)) {
        socket.terminate();
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  return {
    app,
    httpServer,
    webSocketServer,
    rooms,
    start: (port = 3000, host = '127.0.0.1') => listen(httpServer, port, host),
    close: async () => {
      clearInterval(heartbeatTimer);
      for (const session of matchSessions.values()) session.stop();
      matchSessions.clear();
      for (const socket of webSocketServer.clients) {
        socket.terminate();
      }
      webSocketServer.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => error ? reject(error) : resolve());
        });
      }
    },
  };

  function broadcastRoomState(roomId: string, room = rooms.getSnapshot(roomId)): void {
    const message: RoomStateMessage = {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'room-state',
      room,
    };
    for (const [client, clientState] of connectionStates) {
      if (clientState.roomId === roomId) sendJson(client, message);
    }
  }

  function startRoomMatch(roomId: string): void {
    const room = rooms.startRound(roomId);
    broadcastRoomState(roomId, room);
    const session = new MatchSession({
      room,
      onSnapshot: (snapshot) => {
        const message: GameStateMessage = {
          protocolVersion: NETWORK_PROTOCOL_VERSION,
          type: 'game-state',
          snapshot,
        };
        for (const [client, clientState] of connectionStates) {
          if (clientState.roomId === roomId) sendJson(client, message);
        }
      },
      onComplete: (snapshot) => {
        if (snapshot.status === 'game-complete') matchSessions.delete(roomId);
        broadcastRoomState(roomId, rooms.completeRound(roomId, snapshot.status === 'game-complete'));
      },
    });
    matchSessions.set(roomId, session);
    session.start();
  }
}

function listen(server: HttpServer, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server.address() as AddressInfo);
    });
  });
}

function rejectConnection(socket: WebSocket, code: string, message: string): void {
  sendProtocolError(socket, code, message);
  socket.close(1002, code.slice(0, 123));
}

function sendProtocolError(socket: WebSocket, code: string, message: string): void {
  const response: ProtocolErrorMessage = {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    type: 'error',
    code,
    message,
  };
  sendJson(socket, response);
}

function sendRoomError(socket: WebSocket, error: unknown): void {
  if (error instanceof RoomRegistryError || error instanceof MatchSessionError) {
    sendProtocolError(socket, error.code, error.message);
    return;
  }
  sendProtocolError(socket, 'INTERNAL_ERROR', 'Unexpected room error');
}

function sendHttpError(response: express.Response, error: unknown): void {
  if (error instanceof RoomRegistryError) {
    response.status(400).json({ code: error.code, message: error.message });
    return;
  }
  response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Unexpected room error' });
}

function sendJson(socket: WebSocket, value: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}
