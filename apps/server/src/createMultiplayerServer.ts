import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express, { type Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES,
  NETWORK_PROTOCOL_VERSION,
  RECONNECT_WINDOW_MS,
  parseClientMessageText,
  type CreateRoomRequestDTO,
  type ClientMessage,
  type GameStateMessage,
  type MatchHistoryDTO,
  type ProtocolErrorMessage,
  type RoomSnapshotDTO,
  type RoomStateMessage,
} from '@snake-game/contracts';
import {
  hashAccessToken,
  RoomRegistry,
  RoomRegistryError,
} from './multiplayer/RoomRegistry';
import { MatchSession, MatchSessionError } from './multiplayer/MatchSession';
import {
  InMemoryMatchHistoryRepository,
  type MatchHistoryRepository,
} from './multiplayer/MatchHistoryRepository';

const EMPTY_WAITING_ROOM_RETENTION_MS = 10 * 60 * 1000;
const COMPLETED_MATCH_RETENTION_MS = 5 * 60 * 1000;
const PUBLIC_MATCH_HISTORY_LIMIT = 50;

export interface ClientConnection {
  connectionId: string;
  socket: WebSocket;
}

export interface MultiplayerServerOptions {
  onClientMessage?: (connection: ClientConnection, message: Exclude<ClientMessage, { type: 'handshake' }>) => void;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectWindowMs?: number;
  historyRepository?: MatchHistoryRepository;
  onHistoryPersistenceError?: (error: unknown, history: MatchHistoryDTO) => void;
  emptyWaitingRoomRetentionMs?: number;
  completedMatchRetentionMs?: number;
  staticDirectory?: string | false;
}

export interface MultiplayerServer {
  app: Express;
  httpServer: HttpServer;
  webSocketServer: WebSocketServer;
  rooms: RoomRegistry;
  historyRepository: MatchHistoryRepository;
  start(port?: number, host?: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface ConnectionState {
  connectionId: string;
  handshakeComplete: boolean;
  lastSeenAt: number;
  roomId?: string;
  playerId?: string;
  departureHandled: boolean;
}

export function createMultiplayerServer(options: MultiplayerServerOptions = {}): MultiplayerServer {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES }));
  const rooms = new RoomRegistry();
  const historyRepository: MatchHistoryRepository =
    options.historyRepository ?? new InMemoryMatchHistoryRepository();
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
  app.get('/api/matches', async (_request, response) => {
    try {
      response.json(await historyRepository.listPublic(PUBLIC_MATCH_HISTORY_LIMIT));
    } catch {
      response.status(500).json({ code: 'HISTORY_READ_FAILED', message: 'Could not read match history' });
    }
  });
  app.get('/api/matches/:matchId', async (request, response) => {
    try {
      const record = await historyRepository.getByMatchId(request.params.matchId);
      if (!record) {
        response.status(404).json({ code: 'MATCH_HISTORY_NOT_FOUND', message: 'Match history was not found' });
        return;
      }
      const token = readBearerToken(request.headers.authorization);
      if (!token) {
        response.status(401).json({ code: 'HISTORY_TOKEN_REQUIRED', message: 'History access token is required' });
        return;
      }
      const tokenHash = hashAccessToken(token);
      if (record.historyTokenHash === tokenHash) {
        response.json(record.history);
        return;
      }
      const participantId = Object.entries(record.participantTokenHashes)
        .find(([, participantTokenHash]) => participantTokenHash === tokenHash)?.[0];
      if (!participantId) {
        response.status(403).json({ code: 'HISTORY_ACCESS_DENIED', message: 'History access token is invalid' });
        return;
      }
      response.json({
        ...record.history,
        participants: record.history.participants.filter((participant) =>
          participant.controllerId === participantId
        ),
      });
    } catch {
      response.status(500).json({ code: 'HISTORY_READ_FAILED', message: 'Could not read match history' });
    }
  });
  const staticDirectory = options.staticDirectory === false
    ? null
    : options.staticDirectory ?? path.resolve(process.cwd(), 'dist');
  if (staticDirectory) app.use(express.static(staticDirectory));

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES,
  });
  const connectionStates = new Map<WebSocket, ConnectionState>();
  const matchSessions = new Map<string, MatchSession>();
  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const completedMatchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingHistorySaves = new Set<Promise<void>>();
  let shuttingDown = false;

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
      departureHandled: false,
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
          clearEmptyRoomTimer(joined.room.roomId);
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
          clearReconnectTimer(joined.room.roomId, joined.playerId);
          matchSessions.get(joined.room.roomId)?.restorePlayer(joined.room, joined.playerId);
          sendJson(socket, {
            protocolVersion: NETWORK_PROTOCOL_VERSION,
            type: 'room-joined',
            ...joined,
          });
          broadcastRoomState(joined.room.roomId, joined.room);
          return;
        }
        if (parsed.message.type === 'leave-match') {
          if (!state.roomId || !state.playerId) {
            throw new RoomRegistryError('ROOM_JOIN_REQUIRED', 'Join a room before leaving a match');
          }
          const room = rooms.getSnapshot(state.roomId);
          if (room.status === 'waiting') {
            const updatedRoom = rooms.removeWaitingParticipant(state.roomId, state.playerId);
            broadcastRoomState(state.roomId, updatedRoom);
            scheduleEmptyRoomRemoval(updatedRoom);
          } else {
            replacePlayerWithBot(state.roomId, state.playerId);
          }
          state.departureHandled = true;
          socket.close(1000, 'PLAYER_LEFT');
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
        if (parsed.message.type === 'fast-forward-round') {
          if (!state.roomId || !state.playerId) {
            throw new RoomRegistryError('ROOM_JOIN_REQUIRED', 'Join a room before fast-forwarding a round');
          }
          const session = matchSessions.get(state.roomId);
          if (!session) throw new MatchSessionError('MATCH_NOT_FOUND', 'No active match exists for this room');
          session.fastForwardRound(state.playerId, parsed.message);
          return;
        }
      } catch (error) {
        sendRoomError(socket, error);
        return;
      }
    });
    socket.on('close', () => {
      connectionStates.delete(socket);
      if (!shuttingDown && !state.departureHandled && state.roomId && state.playerId) {
        try {
          if (rooms.getSnapshot(state.roomId).status !== 'game-complete') {
            beginReconnectWindow(state.roomId, state.playerId);
          }
        } catch {
          // The room may already have been removed while the socket was closing.
        }
      }
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
    historyRepository,
    start: (port = 3000, host = '127.0.0.1') => listen(httpServer, port, host),
    close: async () => {
      shuttingDown = true;
      clearInterval(heartbeatTimer);
      for (const timer of reconnectTimers.values()) clearTimeout(timer);
      reconnectTimers.clear();
      for (const timer of emptyRoomTimers.values()) clearTimeout(timer);
      emptyRoomTimers.clear();
      for (const timer of completedMatchTimers.values()) clearTimeout(timer);
      completedMatchTimers.clear();
      for (const session of matchSessions.values()) session.stop();
      matchSessions.clear();
      await Promise.all(pendingHistorySaves);
      await historyRepository.close?.();
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
    clearEmptyRoomTimer(roomId);
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
        if (snapshot.status === 'game-complete') scheduleCompletedMatchRemoval(roomId);
        broadcastRoomState(roomId, rooms.completeRound(roomId, snapshot.status === 'game-complete'));
      },
      onHistoryReady: saveMatchHistory,
    });
    matchSessions.set(roomId, session);
    session.start();
  }

  function saveMatchHistory(history: MatchHistoryDTO): void {
    const access = rooms.getMatchHistoryAccess(history.roomId);
    const save = historyRepository.save({ history, ...access })
      .catch((error: unknown) => options.onHistoryPersistenceError?.(error, history))
      .finally(() => pendingHistorySaves.delete(save));
    pendingHistorySaves.add(save);
  }

  function beginReconnectWindow(roomId: string, playerId: string): void {
    clearReconnectTimer(roomId, playerId);
    try {
      const room = rooms.markReconnecting(roomId, playerId);
      matchSessions.get(roomId)?.pausePlayer(room, playerId);
      broadcastRoomState(roomId, room);
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      reconnectTimers.delete(reconnectTimerKey(roomId, playerId));
      try {
        const room = rooms.getSnapshot(roomId);
        if (room.status === 'waiting') {
          const updatedRoom = rooms.removeWaitingParticipant(roomId, playerId);
          broadcastRoomState(roomId, updatedRoom);
          scheduleEmptyRoomRemoval(updatedRoom);
        } else {
          replacePlayerWithBot(roomId, playerId);
        }
      } catch {
        // The room or participant may have been removed before the timer fired.
      }
    }, options.reconnectWindowMs ?? RECONNECT_WINDOW_MS);
    timer.unref();
    reconnectTimers.set(reconnectTimerKey(roomId, playerId), timer);
  }

  function replacePlayerWithBot(roomId: string, playerId: string): void {
    clearReconnectTimer(roomId, playerId);
    const room = rooms.replaceParticipantWithBot(roomId, playerId);
    matchSessions.get(roomId)?.replacePlayerWithBot(room, playerId);
    broadcastRoomState(roomId, room);
  }

  function clearReconnectTimer(roomId: string, playerId: string): void {
    const key = reconnectTimerKey(roomId, playerId);
    const timer = reconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    reconnectTimers.delete(key);
  }

  function scheduleEmptyRoomRemoval(room: RoomSnapshotDTO): void {
    if (room.status !== 'waiting' || room.participants.length > 0) return;
    clearEmptyRoomTimer(room.roomId);
    const timer = setTimeout(() => {
      emptyRoomTimers.delete(room.roomId);
      rooms.removeIfEmptyWaiting(room.roomId);
    }, options.emptyWaitingRoomRetentionMs ?? EMPTY_WAITING_ROOM_RETENTION_MS);
    timer.unref();
    emptyRoomTimers.set(room.roomId, timer);
  }

  function clearEmptyRoomTimer(roomId: string): void {
    const timer = emptyRoomTimers.get(roomId);
    if (timer) clearTimeout(timer);
    emptyRoomTimers.delete(roomId);
  }

  function scheduleCompletedMatchRemoval(roomId: string): void {
    const existingTimer = completedMatchTimers.get(roomId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      completedMatchTimers.delete(roomId);
      matchSessions.delete(roomId);
    }, options.completedMatchRetentionMs ?? COMPLETED_MATCH_RETENTION_MS);
    timer.unref();
    completedMatchTimers.set(roomId, timer);
  }
}

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function reconnectTimerKey(roomId: string, playerId: string): string {
  return `${roomId}:${playerId}`;
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
