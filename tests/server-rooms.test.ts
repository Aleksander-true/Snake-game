/** @jest-environment node */

import WebSocket, { type RawData } from 'ws';
import {
  NETWORK_PROTOCOL_VERSION,
  type CreateRoomResponseDTO,
  type PublicRoomSummaryDTO,
  type RoomConfigDTO,
  type RoomSnapshotDTO,
  type ServerMessage,
} from '@snake-game/contracts';
import { createMultiplayerServer, type MultiplayerServer } from '../apps/server/src/createMultiplayerServer';
import { MatchSession } from '../apps/server/src/multiplayer/MatchSession';

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

  test('starts an authoritative match and acknowledges buffered input after ready-check', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const created = await createRoom(baseUrl, {
      ...baseConfig,
      humanSlots: 1,
      bots: [],
    });
    const socket = await connectAndHandshake(webSocketUrl);

    const joinedPromise = readUntilType(socket, 'room-joined');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: created.room.roomId,
      reconnectToken: created.reconnectToken,
    }));
    await joinedPromise;

    const initialStatePromise = readUntilType(socket, 'game-state');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'set-ready',
      ready: true,
    }));
    const initialState = await initialStatePromise;
    if (initialState.type !== 'game-state') throw new Error('Expected game-state message');
    expect(initialState.snapshot).toMatchObject({
      tick: 0,
      status: 'playing',
      snakes: [{ controller: { controllerId: created.playerId, type: 'human' } }],
    });

    const acknowledgedStatePromise = readUntilType(socket, 'game-state');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'direction',
      matchId: initialState.snapshot.matchId,
      playerId: created.playerId,
      sequence: 0,
      direction: 'down',
    }));
    const acknowledgedState = await acknowledgedStatePromise;
    if (acknowledgedState.type !== 'game-state') throw new Error('Expected game-state message');
    expect(acknowledgedState.snapshot.tick).toBeGreaterThan(0);
    expect(acknowledgedState.snapshot.acknowledgedInputByPlayer[created.playerId]).toBe(0);
    expect(acknowledgedState.snapshot.snakes[0].direction).toBe('down');
    socket.close();
  });

  test('cancels replacement on reconnect and assigns a bot after the next timeout', async () => {
    server = createMultiplayerServer({ reconnectWindowMs: 250 });
    const address = await server.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const created = await createRoom(baseUrl, {
      ...baseConfig,
      humanSlots: 1,
      bots: [{ replaceableByPlayerBetweenRounds: false }],
    });
    const socket = await connectAndHandshake(webSocketUrl);
    const joinedPromise = readUntilType(socket, 'room-joined');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: created.room.roomId,
      reconnectToken: created.reconnectToken,
    }));
    await joinedPromise;
    const initialStatePromise = readUntilType(socket, 'game-state');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'set-ready',
      ready: true,
    }));
    await initialStatePromise;

    await closeSocket(socket);
    await waitForCondition(() =>
      server.rooms.getSnapshot(created.room.roomId).participants[0].status === 'reconnecting'
    );

    const reconnectedSocket = await connectAndHandshake(webSocketUrl);
    const rejoinedPromise = readUntilType(reconnectedSocket, 'room-joined');
    reconnectedSocket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: created.room.roomId,
      reconnectToken: created.reconnectToken,
    }));
    await rejoinedPromise;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(server.rooms.getSnapshot(created.room.roomId).participants[0].status).toBe('connected');

    await closeSocket(reconnectedSocket);
    await waitForCondition(() =>
      server.rooms.getSnapshot(created.room.roomId).participants[0].status === 'replaced-by-bot'
    );

    const rejectedSocket = await connectAndHandshake(webSocketUrl);
    const errorPromise = readUntilType(rejectedSocket, 'error');
    rejectedSocket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: created.room.roomId,
      reconnectToken: created.reconnectToken,
    }));
    await expect(errorPromise).resolves.toMatchObject({ code: 'RECONNECT_WINDOW_EXPIRED' });
    rejectedSocket.close();
  });

  test('intentional leave transfers control to a bot immediately', async () => {
    server = createMultiplayerServer();
    const address = await server.start(0);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const webSocketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const created = await createRoom(baseUrl, {
      ...baseConfig,
      humanSlots: 1,
      bots: [{ replaceableByPlayerBetweenRounds: false }],
    });
    const socket = await connectAndHandshake(webSocketUrl);
    const joinedPromise = readUntilType(socket, 'room-joined');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: created.room.roomId,
      reconnectToken: created.reconnectToken,
    }));
    await joinedPromise;
    const initialStatePromise = readUntilType(socket, 'game-state');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'set-ready',
      ready: true,
    }));
    await initialStatePromise;

    const replacedStatePromise = readUntilType(socket, 'room-state');
    socket.send(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'leave-match',
    }));
    const replacedState = await replacedStatePromise;

    expect(replacedState.room.participants[0].status).toBe('replaced-by-bot');
  });

  test('carries progress into the next round and completes the series after round 10', () => {
    const firstRoom = createPlayingRoomSnapshot(1);
    const emittedSnapshots: Array<Extract<ServerMessage, { type: 'game-state' }>['snapshot']> = [];
    const session = new MatchSession({
      room: firstRoom,
      seed: 17,
      now: () => 1000,
      onSnapshot: (snapshot) => emittedSnapshots.push(snapshot),
    });
    const firstFinal = processUntilComplete(session);
    expect(firstFinal.status).toBe('round-complete');

    session.startNextRound({
      ...firstRoom,
      status: 'playing',
      currentRound: 2,
    });
    session.stop();
    const secondInitial = emittedSnapshots[emittedSnapshots.length - 1];
    expect(secondInitial).toMatchObject({
      level: 2,
      tick: 0,
      snakes: firstFinal.snakes.map((snake) => ({
        score: snake.score,
        levelsWon: snake.levelsWon,
      })),
    });

    const finalSession = new MatchSession({
      room: createPlayingRoomSnapshot(10),
      seed: 17,
      now: () => 1000,
      onSnapshot: () => undefined,
    });
    expect(processUntilComplete(finalSession).status).toBe('game-complete');
  });

  test('pauses a reconnecting snake and resumes the same slot under bot control', () => {
    const room = createPlayingRoomSnapshot(1);
    const session = new MatchSession({ room, seed: 23, onSnapshot: () => undefined });
    const playerId = room.participants[0].playerId;
    const initialHead = session.createSnapshot().snakes[0].segments[0];
    const reconnectingRoom = withParticipantStatus(room, playerId, 'reconnecting');

    session.pausePlayer(reconnectingRoom, playerId);
    const pausedSnapshot = session.processTick();
    expect(pausedSnapshot.snakes[0].segments[0]).toEqual(initialHead);
    expect(pausedSnapshot.snakes[0].ticksWithoutFood).toBe(1);
    expect(pausedSnapshot.snakes[0].controller).toMatchObject({ type: 'human', connected: false });

    const replacedRoom = withParticipantStatus(room, playerId, 'replaced-by-bot');
    session.replacePlayerWithBot(replacedRoom, playerId);
    const botSnapshot = session.processTick();
    expect(botSnapshot.snakes[0].segments[0]).not.toEqual(initialHead);
    expect(botSnapshot.snakes[0].controller).toMatchObject({ type: 'bot', connected: true });
  });

  test('includes authoritative enemies in snapshots from level four', () => {
    const room = createPlayingRoomSnapshot(4);
    const session = new MatchSession({ room, seed: 31, onSnapshot: () => undefined });
    const enemies = session.createSnapshot().enemies;

    expect(enemies.length).toBeGreaterThanOrEqual(1);
    expect(enemies[0]).toEqual(expect.objectContaining({
      enemyId: 'enemy-0',
      kind: 'hedgehog',
      width: 2,
      height: 2,
      facing: expect.stringMatching(/^(left|right)$/),
    }));
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

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out while waiting for server state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function readServerMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data: RawData) => resolve(JSON.parse(data.toString()) as ServerMessage));
    socket.once('error', reject);
  });
}

function readUntilType<T extends ServerMessage['type']>(
  socket: WebSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: RawData): void => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.type !== type) return;
      socket.off('message', onMessage);
      resolve(message as Extract<ServerMessage, { type: T }>);
    };
    socket.on('message', onMessage);
    socket.once('error', reject);
  });
}

function createPlayingRoomSnapshot(currentRound: number): RoomSnapshotDTO {
  return {
    roomId: `room-${currentRound}`,
    config: {
      ...baseConfig,
      humanSlots: 2,
      bots: [],
    },
    status: 'playing',
    currentRound,
    participants: [
      { playerId: 'player-1', name: 'Первый', slotIndex: 0, isCreator: true, status: 'ready' },
      { playerId: 'player-2', name: 'Второй', slotIndex: 1, isCreator: false, status: 'ready' },
    ],
  };
}

function withParticipantStatus(
  room: RoomSnapshotDTO,
  playerId: string,
  status: RoomSnapshotDTO['participants'][number]['status'],
): RoomSnapshotDTO {
  return {
    ...room,
    participants: room.participants.map((participant) =>
      participant.playerId === playerId ? { ...participant, status } : { ...participant }
    ),
  };
}

function processUntilComplete(session: MatchSession) {
  for (let tick = 0; tick < 1000; tick++) {
    const snapshot = session.processTick();
    if (snapshot.status !== 'playing') return snapshot;
  }
  throw new Error('Match round did not complete within the test tick limit');
}
