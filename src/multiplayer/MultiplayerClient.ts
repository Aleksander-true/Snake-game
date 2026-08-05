import {
  NETWORK_PROTOCOL_VERSION,
  parseServerMessageText,
  type DirectionCommandMessage,
  type GameStateMessage,
  type JoinRoomMessage,
  type NetworkDirection,
  type ProtocolErrorMessage,
  type ReconnectMessage,
  type RoomJoinedMessage,
  type RoomStateMessage,
  type ServerMessage,
} from '@snake-game/contracts';

export interface MultiplayerSessionIdentity {
  roomId: string;
  playerId: string;
  reconnectToken: string;
}

export interface MultiplayerClientHandlers {
  onConnected?: (connectionId: string) => void;
  onRoomJoined?: (message: RoomJoinedMessage) => void;
  onRoomState?: (message: RoomStateMessage) => void;
  onGameState?: (message: GameStateMessage) => void;
  onProtocolError?: (message: ProtocolErrorMessage) => void;
  onDisconnected?: (event: CloseEvent) => void;
  onTransportError?: (error: Error) => void;
}

export interface MultiplayerClientOptions {
  url?: string;
  handlers?: MultiplayerClientHandlers;
  createWebSocket?: (url: string) => WebSocket;
}

/** Browser transport for the versioned authoritative multiplayer protocol. */
export class MultiplayerClient {
  private readonly url: string;
  private readonly handlers: MultiplayerClientHandlers;
  private readonly createWebSocket: (url: string) => WebSocket;
  private socket: WebSocket | null = null;
  private connectionId: string | null = null;
  private sessionIdentity: MultiplayerSessionIdentity | null = null;
  private matchId: string | null = null;
  private nextInputSequence = 0;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  constructor(options: MultiplayerClientOptions = {}) {
    this.url = options.url ?? getDefaultMultiplayerWebSocketUrl();
    this.handlers = options.handlers ?? {};
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url));
  }

  connect(): Promise<void> {
    if (this.connectionId && this.socket?.readyState === 1) return Promise.resolve();
    if (this.connectResolve) {
      return Promise.reject(new Error('Multiplayer connection is already in progress'));
    }

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      const socket = this.createWebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => this.send({
        protocolVersion: NETWORK_PROTOCOL_VERSION,
        type: 'handshake',
      });
      socket.onmessage = (event) => this.handleMessage(event);
      socket.onerror = () => this.handleTransportError(new Error('Не удалось подключиться к серверу'));
      socket.onclose = (event) => this.handleClose(event);
    });
  }

  joinRoom(options: { playerName: string; roomId?: string; privateCode?: string }): void {
    const message: JoinRoomMessage = {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'join-room',
      playerName: options.playerName,
      roomId: options.roomId,
      privateCode: options.privateCode,
    };
    this.send(message);
  }

  reconnect(identity: MultiplayerSessionIdentity = this.requireSessionIdentity()): void {
    const message: ReconnectMessage = {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'reconnect',
      roomId: identity.roomId,
      reconnectToken: identity.reconnectToken,
    };
    this.send(message);
  }

  setReady(ready: boolean): void {
    this.send({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'set-ready',
      ready,
    });
  }

  sendDirection(direction: NetworkDirection): number {
    const identity = this.requireSessionIdentity();
    if (!this.matchId) throw new Error('Матч ещё не начался');
    const sequence = this.nextInputSequence++;
    const message: DirectionCommandMessage = {
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'direction',
      matchId: this.matchId,
      playerId: identity.playerId,
      sequence,
      direction,
    };
    this.send(message);
    return sequence;
  }

  leaveMatch(): void {
    this.send({
      protocolVersion: NETWORK_PROTOCOL_VERSION,
      type: 'leave-match',
    });
  }

  closeTransport(): void {
    this.socket?.close(1000, 'CLIENT_CLOSED');
  }

  getSessionIdentity(): MultiplayerSessionIdentity | null {
    return this.sessionIdentity ? { ...this.sessionIdentity } : null;
  }

  getMatchId(): string | null {
    return this.matchId;
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') {
      this.handleTransportError(new Error('Сервер прислал неподдерживаемое бинарное сообщение'));
      return;
    }
    const parsed = parseServerMessageText(event.data);
    if (!parsed.ok) {
      this.handleTransportError(new Error(parsed.message));
      return;
    }
    this.dispatchMessage(parsed.message);
  }

  private dispatchMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'connected':
        this.connectionId = message.connectionId;
        this.resolveConnect();
        this.handlers.onConnected?.(message.connectionId);
        break;
      case 'room-joined':
        this.sessionIdentity = {
          roomId: message.room.roomId,
          playerId: message.playerId,
          reconnectToken: message.reconnectToken,
        };
        this.handlers.onRoomJoined?.(message);
        break;
      case 'room-state':
        this.handlers.onRoomState?.(message);
        break;
      case 'game-state':
        const previousMatchId = this.matchId;
        this.matchId = message.snapshot.matchId;
        const acknowledgedSequence = this.sessionIdentity
          ? message.snapshot.acknowledgedInputByPlayer[this.sessionIdentity.playerId]
          : undefined;
        if (previousMatchId !== this.matchId) {
          this.nextInputSequence = Math.max(0, (acknowledgedSequence ?? -1) + 1);
        } else if (acknowledgedSequence !== undefined) {
          this.nextInputSequence = Math.max(this.nextInputSequence, acknowledgedSequence + 1);
        }
        this.handlers.onGameState?.(message);
        break;
      case 'error':
        this.handlers.onProtocolError?.(message);
        if (!this.connectionId) this.rejectConnect(new Error(message.message));
        break;
    }
  }

  private send(message: object): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error('Нет активного соединения с сервером');
    }
    this.socket.send(JSON.stringify(message));
  }

  private requireSessionIdentity(): MultiplayerSessionIdentity {
    if (!this.sessionIdentity) throw new Error('Игрок ещё не подключён к комнате');
    return this.sessionIdentity;
  }

  private handleTransportError(error: Error): void {
    this.handlers.onTransportError?.(error);
    if (!this.connectionId) this.rejectConnect(error);
  }

  private handleClose(event: CloseEvent): void {
    this.socket = null;
    this.connectionId = null;
    this.rejectConnect(new Error('Соединение с сервером закрыто'));
    this.handlers.onDisconnected?.(event);
  }

  private resolveConnect(): void {
    this.connectResolve?.();
    this.clearConnectPromise();
  }

  private rejectConnect(error: Error): void {
    this.connectReject?.(error);
    this.clearConnectPromise();
  }

  private clearConnectPromise(): void {
    this.connectResolve = null;
    this.connectReject = null;
  }
}

/** Resolve the multiplayer endpoint from the page origin for local proxy and HTTPS deployment. */
export function getDefaultMultiplayerWebSocketUrl(
  location: Pick<Location, 'protocol' | 'host'> = window.location
): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}
