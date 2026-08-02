/** @jest-environment node */

import WebSocket, { type RawData } from 'ws';
import {
  NETWORK_PROTOCOL_VERSION,
  type CreateRoomResponseDTO,
  type PublicRoomSummaryDTO,
  type RoomConfigDTO,
  type ServerMessage,
} from '@snake-game/contracts';
import { createMultiplayerServer, type MultiplayerServer } from '../apps/server/src/createMultiplayerServer';

const baseConfig = {
  name: 'Тестовая комната',
  visibility: 'public' as const,
  humanSlots: 2,
  bots: [{ replaceableByPlayerBetweenRounds: true }],
  difficultyLevel: 5,
  gameMode: 'classic' as const,
};

describe('multiplayer room lobby', () => {
  let server: MultiplayerServer;

  afterEach(async () => {
    await server?.close();
  });

  test('creates rooms over HTTP and lists only public rooms', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const publicRoom = await createRoom(baseUrl, baseConfig);
    const privateRoom = await createRoom(baseUrl, {
      ...baseConfig,
      name: 'Приватная комната',
      visibility: 'private',
    });
    const response = await fetch(`${baseUrl}/api/rooms`);
    const rooms = await response.json() as PublicRoomSummaryDTO[];

    expect(publicRoom.privateCode).toBeUndefined();
    expect(privateRoom.privateCode).toMatch(/^[A-F0-9]{8}$/);
    expect(rooms).toEqual([
      expect.objectContaining({
        roomId: publicRoom.room.roomId,
        connectedHumans: 1,
        canJoin: true,
      }),
    ]);
  });

  test('joins a private room by code and completes its ready-check', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const created = await createRoom(baseUrl, { ...baseConfig, visibility: 'private' });
    const socket = await connectAndHandshake(webSocketUrl);

    const joinedPromise = readServerMessage(socket);
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'join-room',
      privateCode: created.privateCode,
      playerName: 'Второй игрок',
    }));
    const joined = await joinedPromise;

    expect(joined).toMatchObject({
      type: 'room-joined',
      room: {
        roomId: created.room.roomId,
        participants: [
          { name: 'Создатель', isCreator: true },
          { name: 'Второй игрок', isCreator: false },
        ],
      },
    });
    if (joined.type !== 'room-joined') throw new Error('Expected room-joined message');
    server.rooms.setReady(created.room.roomId, created.playerId, true);
    server.rooms.setReady(created.room.roomId, joined.playerId, true);
    expect(server.rooms.isReadyToStart(created.room.roomId)).toBe(true);
    socket.close();
  });
});

async function createRoom(baseUrl: string, config: RoomConfigDTO): Promise<CreateRoomResponseDTO> {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config, creatorName: 'Создатель' }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<CreateRoomResponseDTO>;
}

async function connectAndHandshake(url: string): Promise<WebSocket> {
  const socket = await new Promise<WebSocket>((resolve, reject) => {
    const connection = new WebSocket(url);
    connection.once('open', () => resolve(connection));
    connection.once('error', reject);
  });
  const connectedPromise = readServerMessage(socket);
  socket.send(JSON.stringify({ protocolVersion: NETWORK_PROTOCOL_VERSION, type: 'handshake' }));
  await connectedPromise;
  return socket;
}

function readServerMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data: RawData) => resolve(JSON.parse(data.toString()) as ServerMessage));
    socket.once('error', reject);
  });
}
