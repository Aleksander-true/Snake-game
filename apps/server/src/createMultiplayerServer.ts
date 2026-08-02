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
  type ClientMessage,
  type ProtocolErrorMessage,
} from '@snake-game/contracts';

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
  start(port?: number, host?: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

interface ConnectionState {
  connectionId: string;
  handshakeComplete: boolean;
  lastSeenAt: number;
}

export function createMultiplayerServer(options: MultiplayerServerOptions = {}): MultiplayerServer {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES }));
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', protocolVersion: NETWORK_PROTOCOL_VERSION });
  });

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_INCOMING_WEBSOCKET_MESSAGE_BYTES,
  });
  const connectionStates = new Map<WebSocket, ConnectionState>();

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
    start: (port = 3000, host = '127.0.0.1') => listen(httpServer, port, host),
    close: async () => {
      clearInterval(heartbeatTimer);
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

function sendJson(socket: WebSocket, value: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}
