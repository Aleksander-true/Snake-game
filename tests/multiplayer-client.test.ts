import {
  NETWORK_PROTOCOL_VERSION,
  parseServerMessageText,
  type RoomSnapshotDTO,
} from '@snake-game/contracts';
import {
  getDefaultMultiplayerWebSocketUrl,
  MultiplayerClient,
} from '../src/multiplayer/MultiplayerClient';

const room: RoomSnapshotDTO = {
  roomId: 'room-1',
  config: {
    name: 'Сетевая комната',
    visibility: 'public',
    humanSlots: 1,
    bots: [],
    difficultyLevel: 5,
    gameMode: 'classic',
  },
  status: 'waiting',
  participants: [{
    playerId: 'player-1',
    name: 'Игрок',
    slotIndex: 0,
    isCreator: true,
    status: 'connected',
  }],
  currentRound: 0,
};

describe('MultiplayerClient', () => {
  test('uses the page origin with the correct WebSocket protocol', () => {
    expect(getDefaultMultiplayerWebSocketUrl({ protocol: 'http:', host: 'localhost:8080' } as Location))
      .toBe('ws://localhost:8080/ws');
    expect(getDefaultMultiplayerWebSocketUrl({ protocol: 'https:', host: 'game.example' } as Location))
      .toBe('wss://game.example/ws');
  });

  test('handshakes, joins a room and sequences direction commands', async () => {
    const socket = new FakeWebSocket();
    const receivedTicks: number[] = [];
    const client = new MultiplayerClient({
      url: 'ws://game.example/ws',
      createWebSocket: () => socket as unknown as WebSocket,
      handlers: {
        onGameState: (message) => receivedTicks.push(message.snapshot.tick),
      },
    });

    const connected = client.connect();
    socket.open();
    expect(socket.sentMessages).toEqual([{
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'handshake',
    }]);
    socket.receive({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'connected',
      connectionId: 'connection-1',
    });
    await connected;

    client.joinRoom({ roomId: room.roomId, playerName: 'Игрок' });
    socket.receive({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'room-joined',
      room,
      playerId: 'player-1',
      reconnectToken: 'secret-token',
    });
    socket.receive(createGameStateMessage());

    expect(client.getSessionIdentity()).toEqual({
      roomId: room.roomId,
      playerId: 'player-1',
      reconnectToken: 'secret-token',
    });
    expect(client.getMatchId()).toBe('match-1');
    expect(receivedTicks).toEqual([12]);
    expect(client.sendDirection('right')).toBe(0);
    expect(client.sendDirection('down')).toBe(1);
    expect(socket.sentMessages.slice(-2)).toEqual([
      expect.objectContaining({ type: 'direction', sequence: 0, direction: 'right' }),
      expect.objectContaining({ type: 'direction', sequence: 1, direction: 'down' }),
    ]);

    socket.receive(createGameStateMessage(5));
    expect(client.sendDirection('up')).toBe(6);
  });

  test('rejects malformed server snapshots before dispatching them', () => {
    const result = parseServerMessageText(JSON.stringify({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'game-state',
      snapshot: { matchId: 'match-1' },
    }));

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_MESSAGE',
      message: 'Game snapshot is invalid',
    });
  });
});

class FakeWebSocket {
  readyState = 0;
  sentMessages: object[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  send(text: string): void {
    this.sentMessages.push(JSON.parse(text) as object);
  }

  receive(message: object): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
}

function createGameStateMessage(acknowledgedSequence = -1): object {
  return {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    type: 'game-state',
    snapshot: {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      matchId: 'match-1',
      serverTimeMs: 1000,
      tick: 12,
      tickIntervalMs: 100,
      acknowledgedInputByPlayer: { 'player-1': acknowledgedSequence },
      status: 'playing',
      level: 1,
      levelTimeLeft: 180,
      difficultyLevel: 5,
      width: 40,
      height: 40,
      snakes: [{
        snakeId: 0,
        slotIndex: 0,
        segments: [{ x: 5, y: 5 }],
        direction: 'right',
        alive: true,
        score: 0,
        levelsWon: 0,
        ticksWithoutFood: 0,
        controller: {
          type: 'human',
          controllerId: 'player-1',
          displayName: 'Игрок',
          connected: true,
        },
      }],
      foods: [],
      enemies: [],
      walls: [],
    },
  };
}
