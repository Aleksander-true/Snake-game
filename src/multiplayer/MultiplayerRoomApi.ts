import type {
  CreateRoomRequestDTO,
  CreateRoomResponseDTO,
  PublicRoomSummaryDTO,
} from '@snake-game/contracts';

export class MultiplayerRoomApi {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly baseUrl = ''
  ) {}

  async listPublicRooms(): Promise<PublicRoomSummaryDTO[]> {
    const response = await this.request(`${this.baseUrl}/api/rooms`);
    const data = await readJsonResponse(response);
    if (!Array.isArray(data)) throw new Error('Сервер вернул некорректный список комнат');
    return data as PublicRoomSummaryDTO[];
  }

  async createRoom(request: CreateRoomRequestDTO): Promise<CreateRoomResponseDTO> {
    const response = await this.request(`${this.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    return await readJsonResponse(response) as CreateRoomResponseDTO;
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const data = await response.json().catch(() => null) as unknown;
  if (response.ok) return data;
  if (isErrorResponse(data)) throw new Error(data.message);
  throw new Error(`Сервер вернул ошибку ${response.status}`);
}

function isErrorResponse(value: unknown): value is { message: string } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { message?: unknown }).message === 'string';
}
