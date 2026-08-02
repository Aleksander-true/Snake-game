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
    participant.status = 'connected';
    return {
      room: toSnapshot(room),
      playerId: participant.playerId,
      reconnectToken: participant.reconnectToken,
    };
  }

  setReady(roomId: string, playerId: string, ready: boolean): RoomSnapshotDTO {
    const room = this.requireRoom(roomId);
    if (room.status !== 'waiting') {
      throw new RoomRegistryError('ROOM_ALREADY_STARTED', 'Ready status cannot be changed after start');
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
    return room.participants.length === room.config.humanSlots
      && room.participants.every((participant) => participant.status === 'ready');
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
