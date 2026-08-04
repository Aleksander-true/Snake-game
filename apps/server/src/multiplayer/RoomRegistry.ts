import { randomBytes, randomUUID } from 'node:crypto';
import {
  MAX_PLAYER_NAME_LENGTH,
  type CreateRoomRequestDTO,
  type CreateRoomResponseDTO,
  type JoinRoomResponseDTO,
  type PublicRoomSummaryDTO,
  type RoomParticipantDTO,
  type RoomSnapshotDTO,
  validateRoomConfig,
} from '@snake-game/contracts';

interface StoredParticipant extends RoomParticipantDTO {
  reconnectToken: string;
}

interface StoredRoom {
  roomId: string;
  privateCode?: string;
  config: CreateRoomRequestDTO['config'];
  status: RoomSnapshotDTO['status'];
  participants: StoredParticipant[];
  currentRound: number;
}

export class RoomRegistryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** In-memory lobby state for one server process. Match state is owned separately. */
export class RoomRegistry {
  private readonly rooms = new Map<string, StoredRoom>();

  createRoom(request: CreateRoomRequestDTO): CreateRoomResponseDTO {
    if (!request || typeof request !== 'object') {
      throw new RoomRegistryError('INVALID_ROOM_REQUEST', 'Room request must be an object');
    }
    const validation = validateRoomConfig(request.config);
    if (!validation.valid) {
      throw new RoomRegistryError('INVALID_ROOM_CONFIG', validation.errors.join('; '));
    }
    const creatorName = validatePlayerName(request.creatorName);
    const roomId = randomUUID();
    const privateCode = request.config.visibility === 'private' ? createPrivateCode() : undefined;
    const creator = createParticipant(creatorName, 0, true);
    const room: StoredRoom = {
      roomId,
      privateCode,
      config: {
        ...request.config,
        name: request.config.name.trim(),
        bots: request.config.bots.map((bot) => ({ ...bot })),
      },
      status: 'waiting',
      participants: [creator],
      currentRound: 0,
    };
    this.rooms.set(roomId, room);
    return {
      room: toSnapshot(room),
      playerId: creator.playerId,
      reconnectToken: creator.reconnectToken,
      privateCode,
    };
  }

  listPublicRooms(): PublicRoomSummaryDTO[] {
    return [...this.rooms.values()]
      .filter((room) => room.config.visibility === 'public')
      .map((room) => ({
        roomId: room.roomId,
        name: room.config.name,
        humanSlots: room.config.humanSlots,
        connectedHumans: room.participants.length,
        botSlots: room.config.bots.length,
        replaceableBotSlots: room.config.bots.filter((bot) => bot.replaceableByPlayerBetweenRounds).length,
        status: room.status,
        canJoin: room.status === 'waiting' && room.participants.length < room.config.humanSlots,
      }));
  }

  joinRoom(options: { roomId?: string; privateCode?: string; playerName: string }): JoinRoomResponseDTO {
    const room = this.findRoom(options.roomId, options.privateCode);
    if (room.status !== 'waiting') {
      throw new RoomRegistryError('ROOM_ALREADY_STARTED', 'Room has already started');
    }
    if (room.participants.length >= room.config.humanSlots) {
      throw new RoomRegistryError('ROOM_FULL', 'All human slots are occupied');
    }
    const participant = createParticipant(validatePlayerName(options.playerName), room.participants.length, false);
    room.participants.push(participant);
    return {
      room: toSnapshot(room),
      playerId: participant.playerId,
      reconnectToken: participant.reconnectToken,
    };
  }

  reconnect(roomId: string, reconnectToken: string): JoinRoomResponseDTO {
    const room = this.requireRoom(roomId);
    const participant = room.participants.find((item) => item.reconnectToken === reconnectToken);
    if (!participant) {
      throw new RoomRegistryError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid');
    }
    if (participant.status === 'replaced-by-bot') {
      throw new RoomRegistryError('RECONNECT_WINDOW_EXPIRED', 'Player control has already passed to a bot');
    }
    participant.status = 'connected';
    return {
      room: toSnapshot(room),
      playerId: participant.playerId,
      reconnectToken: participant.reconnectToken,
    };
  }

  markReconnecting(roomId: string, playerId: string): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    const participant = requireParticipant(room, playerId);
    if (participant.status === 'replaced-by-bot') return toSnapshot(room);
    participant.status = 'reconnecting';
    transferCreator(room, participant);
    return toSnapshot(room);
  }

  replaceParticipantWithBot(roomId: string, playerId: string): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    const participant = requireParticipant(room, playerId);
    participant.status = 'replaced-by-bot';
    transferCreator(room, participant);
    return toSnapshot(room);
  }

  setReady(roomId: string, playerId: string, ready: boolean): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    if (room.status !== 'waiting' && room.status !== 'round-complete') {
      throw new RoomRegistryError('ROOM_NOT_AWAITING_READY', 'Room is not waiting for ready status');
    }
    const participant = room.participants.find((item) => item.playerId === playerId);
    if (!participant) {
      throw new RoomRegistryError('PLAYER_NOT_FOUND', 'Player does not belong to this room');
    }
    participant.status = ready ? 'ready' : 'connected';
    return toSnapshot(room);
  }

  getSnapshot(roomId: string): RoomSnapshotDTO {
    return toSnapshot(this.requireRoom(roomId));
  }

  isReadyToStart(roomId: string): boolean {
    const room = this.requireRoom(roomId);
    return (room.status === 'waiting' || room.status === 'round-complete')
      && room.participants.length === room.config.humanSlots
      && room.participants.every((participant) =>
        participant.status === 'ready' || participant.status === 'replaced-by-bot'
      );
  }

  startRound(roomId: string): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    if (!this.isReadyToStart(roomId)) {
      throw new RoomRegistryError('ROOM_NOT_READY', 'All human slots must be filled and ready');
    }
    room.status = 'playing';
    room.currentRound++;
    return toSnapshot(room);
  }

  completeRound(roomId: string, gameComplete: boolean): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    room.status = gameComplete ? 'game-complete' : 'round-complete';
    if (!gameComplete) {
      for (const participant of room.participants) {
        if (participant.status !== 'replaced-by-bot') participant.status = 'connected';
      }
    }
    return toSnapshot(room);
  }

  private findRoom(roomId?: string, privateCode?: string): StoredRoom {
    if (roomId) {
      const room = this.requireRoom(roomId);
      if (room.config.visibility === 'private' && room.privateCode !== privateCode?.toUpperCase()) {
        throw new RoomRegistryError('PRIVATE_CODE_REQUIRED', 'A valid private room code is required');
      }
      return room;
    }
    if (privateCode) {
      const room = [...this.rooms.values()].find((item) => item.privateCode === privateCode.toUpperCase());
      if (room) return room;
    }
    throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room was not found');
  }

  private requireRoom(roomId: string): StoredRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomRegistryError('ROOM_NOT_FOUND', 'Room was not found');
    return room;
  }
}

function requireParticipant(room: StoredRoom, playerId: string): StoredParticipant {
  const participant = room.participants.find((item) => item.playerId === playerId);
  if (!participant) {
    throw new RoomRegistryError('PLAYER_NOT_FOUND', 'Player does not belong to this room');
  }
  return participant;
}

function transferCreator(room: StoredRoom, departingParticipant: StoredParticipant): void {
  if (!departingParticipant.isCreator) return;
  const successor = room.participants
    .filter((participant) =>
      participant.playerId !== departingParticipant.playerId
      && (participant.status === 'connected' || participant.status === 'ready')
    )
    .sort((left, right) => left.slotIndex - right.slotIndex)[0];
  if (!successor) return;
  departingParticipant.isCreator = false;
  successor.isCreator = true;
}

function createParticipant(name: string, slotIndex: number, isCreator: boolean): StoredParticipant {
  return {
    playerId: randomUUID(),
    reconnectToken: randomBytes(24).toString('base64url'),
    name,
    slotIndex,
    isCreator,
    status: 'connected',
  };
}

function validatePlayerName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > MAX_PLAYER_NAME_LENGTH) {
    throw new RoomRegistryError('INVALID_PLAYER_NAME', `Player name must contain 1-${MAX_PLAYER_NAME_LENGTH} characters`);
  }
  return value.trim();
}

function createPrivateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function toSnapshot(room: StoredRoom): RoomSnapshotDTO {
  return {
    roomId: room.roomId,
    config: {
      ...room.config,
      bots: room.config.bots.map((bot) => ({ ...bot })),
    },
    status: room.status,
    participants: room.participants.map(({ reconnectToken: _token, ...participant }) => ({ ...participant })),
    currentRound: room.currentRound,
  };
}
