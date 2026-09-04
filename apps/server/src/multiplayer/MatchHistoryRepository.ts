import type { MatchHistoryDTO } from '@snake-game/contracts';

export interface MatchHistoryRepository {
  save(history: MatchHistoryDTO): Promise<void>;
  getByMatchId(matchId: string): Promise<MatchHistoryDTO | null>;
}

export class InMemoryMatchHistoryRepository implements MatchHistoryRepository {
  private readonly histories = new Map<string, MatchHistoryDTO>();

  async save(history: MatchHistoryDTO): Promise<void> {
    this.histories.set(history.matchId, cloneHistory(history));
  }

  async getByMatchId(matchId: string): Promise<MatchHistoryDTO | null> {
    const history = this.histories.get(matchId);
    return history ? cloneHistory(history) : null;
  }
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
