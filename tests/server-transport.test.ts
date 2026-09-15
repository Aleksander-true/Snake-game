/** @jest-environment node */

import path from 'node:path';
import WebSocket, { type RawData } from 'ws';
import { NETWORK_PROTOCOL_VERSION, type ServerMessage } from '@snake-game/contracts';
import {
  createMultiplayerServer,
  type MultiplayerServer,
} from '../apps/server/src/createMultiplayerServer';
import { InMemoryMatchHistoryRepository } from '../apps/server/src/multiplayer/MatchHistoryRepository';
import { hashAccessToken } from '../apps/server/src/multiplayer/RoomRegistry';

describe('multiplayer server transport', () => {
  let server: MultiplayerServer;
  let baseUrl: string;
  let webSocketUrl: string;

  afterEach(async () => {
    await server?.close();
  });

  test('reports server health and protocol version', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      protocolVersion: NETWORK_PROTOCOL_VERSION,
    });
  });

  test('serves the browser application from the configured static directory', async () => {
    server = createMultiplayerServer({
      staticDirectory: path.resolve(__dirname, '../apps/web/src'),
    });
    const address = await server.start(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/index.html`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="app"></div>');

    const labResponse = await fetch(`${baseUrl}/lab/index.html`);
    expect(labResponse.status).toBe(200);
    expect(await labResponse.text()).toContain('Лаборатория обучения');
  });

  test('exposes public summaries and protects full match history with bearer tokens', async () => {
    const historyRepository = new InMemoryMatchHistoryRepository();
    const publicHistory = createHistory('public-match', 'public');
    const privateHistory = createHistory('private-match', 'private');
    await historyRepository.save({
      history: publicHistory,
      participantTokenHashes: {
        'player-1': hashAccessToken('player-reconnect-token'),
      },
    });
    await historyRepository.save({
      history: privateHistory,
      historyTokenHash: hashAccessToken('private-history-token'),
      participantTokenHashes: {},
    });
    server = createMultiplayerServer({ historyRepository });
    const address = await server.start(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const publicResponse = await fetch(`${baseUrl}/api/matches`);
    const publicMatches = await publicResponse.json() as Array<{ matchId: string; participants: unknown[] }>;
    expect(publicMatches).toHaveLength(1);
    expect(publicMatches[0].matchId).toBe(publicHistory.matchId);
    expect(publicMatches[0].participants).toHaveLength(2);
    expect(publicMatches[0].participants[0]).not.toHaveProperty('controlPeriods');

    const participantResponse = await fetch(`${baseUrl}/api/matches/${publicHistory.matchId}`, {
      headers: { authorization: 'Bearer player-reconnect-token' },
    });
    const participantHistory = await participantResponse.json() as typeof publicHistory;
    expect(participantHistory.participants).toHaveLength(1);
    expect(participantHistory.participants[0].controllerId).toBe('player-1');

    const privateResponse = await fetch(`${baseUrl}/api/matches/${privateHistory.matchId}`, {
      headers: { authorization: 'Bearer private-history-token' },
    });
    const fullPrivateHistory = await privateResponse.json() as typeof privateHistory;
    expect(fullPrivateHistory.participants).toHaveLength(2);
  });

  test('completes handshake and dispatches a validated client message', async () => {
    const receivedTypes: string[] = [];
    server = createMultiplayerServer({
      onClientMessage: (_connection, message) => receivedTypes.push(message.type),
    });
    const address = await server.start(0);
    webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const socket = await openWebSocket(webSocketUrl);

    const connectedPromise = readServerMessage(socket);
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'handshake',
    }));
    const connected = await connectedPromise;

    expect(connected.type).toBe('connected');
    expect(connected).toHaveProperty('connectionId');

    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'set-ready',
      ready: true,
    }));
    await waitFor(() => receivedTypes.length === 1);
    expect(receivedTypes).toEqual(['set-ready']);
    socket.close();
  });

  test('rejects a client using an unsupported protocol version', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const socket = await openWebSocket(webSocketUrl);

    const errorPromise = readServerMessage(socket);
    socket.send(JSON.stringify({ protocolVersion: 999, type: 'handshake' }));
    const error = await errorPromise;

    expect(error).toMatchObject({
      type: 'error',
      code: 'UNSUPPORTED_PROTOCOL_VERSION',
    });
  });
});

function openWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function readServerMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data: RawData) => resolve(JSON.parse(data.toString()) as ServerMessage));
    socket.once('error', reject);
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out while waiting for a WebSocket message');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createHistory(matchId: string, visibility: 'public' | 'private') {
  return {
    matchId,
    roomId: `${matchId}-room`,
    roomName: `${matchId} room`,
    visibility,
    startedAt: '2026-09-10T10:00:00.000Z',
    finishedAt: '2026-09-10T10:10:00.000Z',
    participants: [
      {
        controllerId: 'player-1',
        displayName: 'Игрок',
        personalScore: 15,
        controlPeriods: [{
          controllerType: 'human' as const,
          controllerId: 'player-1',
          startedAtTick: 0,
          endedAtTick: 50,
          scoreGained: 15,
        }],
      },
      {
        controllerId: 'bot:1',
        displayName: 'Бот',
        personalScore: 10,
        controlPeriods: [{
          controllerType: 'bot' as const,
          controllerId: 'bot:1',
          startedAtTick: 0,
          endedAtTick: 50,
          scoreGained: 10,
        }],
      },
    ],
  };
}
