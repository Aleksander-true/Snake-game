/** @jest-environment node */

import WebSocket, { type RawData } from 'ws';
import { NETWORK_PROTOCOL_VERSION, type ServerMessage } from '@snake-game/contracts';
import {
  createMultiplayerServer,
  type MultiplayerServer,
} from '../apps/server/src/createMultiplayerServer';

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
