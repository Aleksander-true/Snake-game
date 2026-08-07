import type {
  CreateRoomResponseDTO,
  NetworkDirection,
  PublicRoomSummaryDTO,
  RoomSnapshotDTO,
} from '@snake-game/contracts';
import {
  MultiplayerClient,
  type MultiplayerClientHandlers,
  type MultiplayerSessionIdentity,
} from '../../multiplayer/MultiplayerClient';
import { MultiplayerRoomApi } from '../../multiplayer/MultiplayerRoomApi';
import { MultiplayerGamePresenter } from './MultiplayerGamePresenter';
import {
  renderMultiplayerLobby,
  type MultiplayerLobbyView,
  type MultiplayerRoomDraft,
} from '../ui/multiplayer';

export interface MultiplayerLobbyCallbacks {
  onBack: () => void;
}

type MultiplayerClientFactory = (handlers: MultiplayerClientHandlers) => MultiplayerClient;

/** Coordinates the room HTTP API, WebSocket transport and lobby UI. */
export class MultiplayerLobbyService {
  private client: MultiplayerClient | null = null;
  private view: MultiplayerLobbyView | null = null;
  private connectionPromise: Promise<void> | null = null;
  private readonly gamePresenter: MultiplayerGamePresenter;
  private active = false;
  private privateCode: string | undefined;
  private currentRoom: RoomSnapshotDTO | null = null;

  constructor(
    private readonly appRoot: HTMLElement,
    private readonly roomApi = new MultiplayerRoomApi(),
    private readonly createClient: MultiplayerClientFactory = (handlers) =>
      new MultiplayerClient({ handlers })
  ) {
    this.gamePresenter = new MultiplayerGamePresenter(appRoot);
  }

  show(callbacks: MultiplayerLobbyCallbacks): void {
    this.stop();
    this.active = true;
    this.view = renderMultiplayerLobby(this.appRoot, {
      onRefresh: () => void this.refreshRooms().catch((error) => this.showError(error)),
      onJoinPublic: (roomId, playerName) => void this.joinPublicRoom(roomId, playerName),
      onJoinPrivate: (privateCode, playerName) => void this.joinPrivateRoom(privateCode, playerName),
      onCreate: (draft) => void this.createRoom(draft),
      onReady: () => this.setReady(),
      onBack: () => {
        this.leaveRoom();
        callbacks.onBack();
      },
    });
    this.client = this.createClient(this.createHandlers());
    this.connectionPromise = this.client.connect();
    void this.initialize();
  }

  stop(): void {
    this.active = false;
    this.gamePresenter.stop();
    this.client?.closeTransport();
    this.client = null;
    this.view = null;
    this.connectionPromise = null;
    this.privateCode = undefined;
    this.currentRoom = null;
  }

  private async initialize(): Promise<void> {
    try {
      await Promise.all([this.requireConnection(), this.refreshRooms()]);
      if (this.active) this.view?.showStatus('Подключено к серверу');
    } catch (error) {
      this.showError(error);
    }
  }

  private async refreshRooms(): Promise<PublicRoomSummaryDTO[]> {
    const rooms = await this.roomApi.listPublicRooms();
    if (this.active) this.view?.showRooms(rooms);
    return rooms;
  }

  private async joinPublicRoom(roomId: string, playerName: string): Promise<void> {
    if (!playerName) {
      this.view?.showStatus('Введите имя игрока', true);
      return;
    }
    try {
      await this.requireConnection();
      this.client?.joinRoom({ roomId, playerName });
      this.view?.showStatus('Подключение к комнате…');
    } catch (error) {
      this.showError(error);
    }
  }

  private async joinPrivateRoom(privateCode: string, playerName: string): Promise<void> {
    if (!privateCode || !playerName) {
      this.view?.showStatus('Введите имя и код приватной комнаты', true);
      return;
    }
    try {
      await this.requireConnection();
      this.client?.joinRoom({ privateCode, playerName });
      this.view?.showStatus('Подключение к приватной комнате…');
    } catch (error) {
      this.showError(error);
    }
  }

  private async createRoom(draft: MultiplayerRoomDraft): Promise<void> {
    if (!draft.creatorName || !draft.config.name) {
      this.view?.showStatus('Введите имя игрока и название комнаты', true);
      return;
    }
    try {
      await this.requireConnection();
      const created = await this.roomApi.createRoom(draft);
      this.privateCode = created.privateCode;
      this.client?.reconnect(toSessionIdentity(created));
      this.view?.showStatus('Комната создана, подключение…');
    } catch (error) {
      this.showError(error);
    }
  }

  private setReady(): void {
    try {
      this.client?.setReady(true);
      this.view?.showStatus('Готовность отправлена серверу');
    } catch (error) {
      this.showError(error);
    }
  }

  private leaveRoom(): void {
    try {
      if (this.client?.getSessionIdentity()) this.client.leaveMatch();
    } catch {
      // The transport may already be closed; the server will apply its disconnect rules.
    }
  }

  private createHandlers(): MultiplayerClientHandlers {
    return {
      onRoomJoined: (message) => {
        if (!this.active) return;
        this.currentRoom = message.room;
        this.view?.showRoom(message.room, message.playerId, this.privateCode);
        this.view?.showStatus('Вы в комнате');
      },
      onRoomState: (message) => this.showRoomState(message.room),
      onGameState: (message) => {
        if (!this.active) return;
        const identity = this.client?.getSessionIdentity();
        if (!identity) return;
        this.gamePresenter.showSnapshot(
          message.snapshot,
          identity.playerId,
          this.currentRoom?.config.gameMode ?? 'classic',
          (direction) => this.sendDirection(direction)
        );
      },
      onProtocolError: (message) => {
        if (!this.active) return;
        this.view?.showStatus(message.message, true);
        this.gamePresenter.showConnectionStatus(message.message, true);
      },
      onTransportError: (error) => this.showError(error),
      onDisconnected: () => {
        if (!this.active) return;
        const message = 'Соединение с сервером потеряно';
        this.view?.showStatus(message, true);
        this.gamePresenter.showConnectionStatus(message, true);
      },
    };
  }

  private showRoomState(room: RoomSnapshotDTO): void {
    if (!this.active) return;
    this.currentRoom = room;
    const identity = this.client?.getSessionIdentity();
    if (identity?.roomId === room.roomId) {
      this.view?.showRoom(room, identity.playerId, this.privateCode);
    }
  }

  private sendDirection(direction: NetworkDirection): void {
    try {
      const sequence = this.client?.sendDirection(direction);
      if (sequence !== undefined) this.gamePresenter.predict(sequence, direction);
    } catch (error) {
      this.showError(error);
    }
  }

  private requireConnection(): Promise<void> {
    if (!this.connectionPromise) return Promise.reject(new Error('Сетевой клиент не запущен'));
    return this.connectionPromise;
  }

  private showError(error: unknown): void {
    if (!this.active) return;
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка сети';
    this.view?.showStatus(message, true);
    this.gamePresenter.showConnectionStatus(message, true);
  }
}

function toSessionIdentity(created: CreateRoomResponseDTO): MultiplayerSessionIdentity {
  return {
    roomId: created.room.roomId,
    playerId: created.playerId,
    reconnectToken: created.reconnectToken,
  };
}
