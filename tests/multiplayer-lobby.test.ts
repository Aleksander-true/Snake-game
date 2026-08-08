import {
  NETWORK_PROTOCOL_VERSION,
  type PublicRoomSummaryDTO,
  type RoomJoinedMessage,
  type RoomSnapshotDTO,
} from '@snake-game/contracts';
import { MultiplayerLobbyService } from '../src/app/services/MultiplayerLobbyService';
import { renderMultiplayerLobby } from '../src/app/ui/multiplayer';
import type {
  MultiplayerClient,
  MultiplayerClientHandlers,
  MultiplayerSessionIdentity,
} from '../src/multiplayer/MultiplayerClient';
import { MultiplayerRoomApi } from '../src/multiplayer/MultiplayerRoomApi';

const publicRoom: PublicRoomSummaryDTO = {
  roomId: 'room-1',
  name: 'Комната друзей',
  humanSlots: 2,
  connectedHumans: 1,
  botSlots: 1,
  replaceableBotSlots: 1,
  status: 'waiting',
  canJoin: true,
};

const roomSnapshot: RoomSnapshotDTO = {
  roomId: publicRoom.roomId,
  config: {
    name: publicRoom.name,
    visibility: 'public',
    humanSlots: 2,
    bots: [{ replaceableByPlayerBetweenRounds: true }],
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

describe('multiplayer lobby', () => {
  test('loads and creates rooms through the same-origin HTTP API', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(jsonResponse([publicRoom]))
      .mockResolvedValueOnce(jsonResponse({
        room: roomSnapshot,
        playerId: 'player-1',
        reconnectToken: 'token-1',
      }, 201));
    const api = new MultiplayerRoomApi(request as unknown as typeof fetch);

    await expect(api.listPublicRooms()).resolves.toEqual([publicRoom]);
    await api.createRoom({ creatorName: 'Игрок', config: roomSnapshot.config });

    expect(request).toHaveBeenNthCalledWith(1, '/api/rooms');
    expect(request).toHaveBeenNthCalledWith(2, '/api/rooms', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ creatorName: 'Игрок', config: roomSnapshot.config }),
    }));
  });

  test('joins a public room and sends ready through the WebSocket client', async () => {
    const root = document.createElement('div');
    const api = {
      listPublicRooms: jest.fn().mockResolvedValue([publicRoom]),
      createRoom: jest.fn(),
    };
    let handlers: MultiplayerClientHandlers = {};
    let identity: MultiplayerSessionIdentity | null = null;
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      joinRoom: jest.fn(),
      reconnect: jest.fn(),
      setReady: jest.fn(),
      leaveMatch: jest.fn(),
      closeTransport: jest.fn(),
      getSessionIdentity: jest.fn(() => identity),
    };
    const service = new MultiplayerLobbyService(
      root,
      api as unknown as MultiplayerRoomApi,
      (createdHandlers) => {
        handlers = createdHandlers;
        return client as unknown as MultiplayerClient;
      }
    );

    service.show({ onBack: jest.fn() });
    await flushPromises();
    (root.querySelector('.multiplayer-room-row .btn') as HTMLButtonElement).click();
    await flushPromises();

    expect(client.joinRoom).toHaveBeenCalledWith({ roomId: publicRoom.roomId, playerName: 'Игрок' });

    identity = { roomId: publicRoom.roomId, playerId: 'player-1', reconnectToken: 'token-1' };
    handlers.onRoomJoined?.(createRoomJoinedMessage());
    (root.querySelector('#multiplayerReadyBtn') as HTMLButtonElement).click();

    expect(root.querySelector('#multiplayerParticipants')?.textContent).toContain('Игрок (вы)');
    expect(client.setReady).toHaveBeenCalledWith(true);
    service.stop();
  });

  test('normalizes a created room to the six-snake network limit', () => {
    const root = document.createElement('div');
    const onCreate = jest.fn();
    renderMultiplayerLobby(root, {
      onRefresh: jest.fn(),
      onJoinPublic: jest.fn(),
      onJoinPrivate: jest.fn(),
      onCreate,
      onReady: jest.fn(),
      onBack: jest.fn(),
    });
    (root.querySelector('#multiplayerHumanSlots') as HTMLInputElement).value = '5';
    (root.querySelector('#multiplayerBotCount') as HTMLInputElement).value = '5';
    (root.querySelector('#multiplayerCreateForm') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        humanSlots: 5,
        bots: [{ replaceableByPlayerBetweenRounds: true }],
      }),
    }));
  });

  test('reconnects with the in-memory token after a technical disconnect', async () => {
    const root = document.createElement('div');
    const api = {
      listPublicRooms: jest.fn().mockResolvedValue([publicRoom]),
      createRoom: jest.fn(),
    };
    const identity = { roomId: publicRoom.roomId, playerId: 'player-1', reconnectToken: 'token-1' };
    let handlers: MultiplayerClientHandlers = {};
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      joinRoom: jest.fn(),
      reconnect: jest.fn(),
      setReady: jest.fn(),
      leaveMatch: jest.fn(),
      closeTransport: jest.fn(),
      getSessionIdentity: jest.fn(() => identity),
    };
    const service = new MultiplayerLobbyService(
      root,
      api as unknown as MultiplayerRoomApi,
      (createdHandlers) => {
        handlers = createdHandlers;
        return client as unknown as MultiplayerClient;
      }
    );
    service.show({ onBack: jest.fn() });
    await flushPromises();
    handlers.onRoomJoined?.(createRoomJoinedMessage());

    handlers.onDisconnected?.(new CloseEvent('close'));
    expect(root.querySelector('#multiplayerStatus')?.textContent).toContain('10 с');
    await flushPromises();

    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(client.reconnect).toHaveBeenCalledWith(identity);
    handlers.onRoomJoined?.(createRoomJoinedMessage());
    expect(root.querySelector('#multiplayerStatus')?.textContent).toBe('Соединение восстановлено');
    service.stop();
  });

  test('stops reconnecting after ten seconds and reports bot takeover', async () => {
    jest.useFakeTimers();
    const root = document.createElement('div');
    const identity = { roomId: publicRoom.roomId, playerId: 'player-1', reconnectToken: 'token-1' };
    let handlers: MultiplayerClientHandlers = {};
    const client = {
      connect: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error('offline')),
      reconnect: jest.fn(),
      closeTransport: jest.fn(),
      getSessionIdentity: jest.fn(() => identity),
    };
    const service = new MultiplayerLobbyService(
      root,
      {
        listPublicRooms: jest.fn().mockResolvedValue([publicRoom]),
        createRoom: jest.fn(),
      } as unknown as MultiplayerRoomApi,
      (createdHandlers) => {
        handlers = createdHandlers;
        return client as unknown as MultiplayerClient;
      }
    );

    try {
      service.show({ onBack: jest.fn() });
      await flushPromises();
      handlers.onRoomJoined?.(createRoomJoinedMessage());
      handlers.onDisconnected?.(new CloseEvent('close'));
      await flushPromises();
      jest.advanceTimersByTime(10_000);

      expect(root.querySelector('#multiplayerStatus')?.textContent).toContain('Управление передано боту');
      expect(client.closeTransport).toHaveBeenCalled();
    } finally {
      service.stop();
      jest.useRealTimers();
    }
  });
});

function createRoomJoinedMessage(): RoomJoinedMessage {
  return {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    type: 'room-joined',
    room: roomSnapshot,
    playerId: 'player-1',
    reconnectToken: 'token-1',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
