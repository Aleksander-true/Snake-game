import type {
  MatchHistoryDTO,
  PublicMatchHistorySummaryDTO,
} from '@snake-game/contracts';

export interface MatchHistoryRecord {
  history: MatchHistoryDTO;
  historyTokenHash?: string;
  participantTokenHashes: Record<string, string>;
}

export interface MatchHistoryRepository {
  save(record: MatchHistoryRecord): Promise<void>;
  getByMatchId(matchId: string): Promise<MatchHistoryRecord | null>;
  listPublic(limit: number): Promise<PublicMatchHistorySummaryDTO[]>;
}

export class InMemoryMatchHistoryRepository implements MatchHistoryRepository {
  private readonly histories = new Map<string, MatchHistoryRecord>();

  async save(record: MatchHistoryRecord): Promise<void> {
    this.histories.set(record.history.matchId, cloneRecord(record));
  }

  async getByMatchId(matchId: string): Promise<MatchHistoryRecord | null> {
    const record = this.histories.get(matchId);
    return record ? cloneRecord(record) : null;
  }

  async listPublic(limit: number): Promise<PublicMatchHistorySummaryDTO[]> {
    return [...this.histories.values()]
      .filter((record) => record.history.visibility === 'public')
      .sort((left, right) => right.history.finishedAt.localeCompare(left.history.finishedAt))
      .slice(0, Math.max(0, limit))
      .map((record) => toPublicSummary(record.history));
  }
}

function cloneRecord(record: MatchHistoryRecord): MatchHistoryRecord {
  return {
    history: cloneHistory(record.history),
    historyTokenHash: record.historyTokenHash,
    participantTokenHashes: { ...record.participantTokenHashes },
  };
}

function cloneHistory(history: MatchHistoryDTO): MatchHistoryDTO {
  return {
    ...history,
    participants: history.participants.map((participant) => ({
      ...participant,
      controlPeriods: participant.controlPeriods.map((period) => ({ ...period })),
    })),
  };
}

function toPublicSummary(history: MatchHistoryDTO): PublicMatchHistorySummaryDTO {
  return {
    matchId: history.matchId,
    roomName: history.roomName,
    startedAt: history.startedAt,
    finishedAt: history.finishedAt,
    participants: history.participants
      .map((participant) => ({
        displayName: participant.displayName,
        personalScore: participant.personalScore,
        controllerType: participant.controlPeriods[0]?.controllerType ?? 'human',
      }))
      .sort((left, right) => right.personalScore - left.personalScore),
  };
}
