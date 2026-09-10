import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MatchHistoryRecord } from '../apps/server/src/multiplayer/MatchHistoryRepository';

const supportsNodeSqlite = Number(process.versions.node.split('.')[0]) >= 22;
const describeWithSqlite = supportsNodeSqlite ? describe : describe.skip;

describeWithSqlite('SQLite multiplayer match history', () => {
  test('persists protected records across repository restarts', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'snake-history-'));
    const databasePath = path.join(directory, 'matches.sqlite');
    const { SqliteMatchHistoryRepository } = await import(
      '../apps/server/src/multiplayer/SqliteMatchHistoryRepository'
    );
    const publicRecord = createRecord('public-match', 'public', '2026-09-10T10:00:00.000Z');
    const privateRecord = createRecord('private-match', 'private', '2026-09-10T11:00:00.000Z');

    try {
      const writer = new SqliteMatchHistoryRepository(databasePath);
      await writer.save(publicRecord);
      await writer.save(privateRecord);
      await writer.close();

      const reader = new SqliteMatchHistoryRepository(databasePath);
      await expect(reader.getByMatchId(publicRecord.history.matchId)).resolves.toEqual(publicRecord);
      await expect(reader.listPublic(10)).resolves.toEqual([
        expect.objectContaining({ matchId: publicRecord.history.matchId }),
      ]);
      await reader.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function createRecord(
  matchId: string,
  visibility: 'public' | 'private',
  finishedAt: string,
): MatchHistoryRecord {
  return {
    history: {
      matchId,
      roomId: `${matchId}-room`,
      roomName: `${matchId} room`,
      visibility,
      startedAt: '2026-09-10T09:00:00.000Z',
      finishedAt,
      participants: [{
        controllerId: 'player-1',
        displayName: 'Игрок',
        personalScore: 12,
        controlPeriods: [{
          controllerType: 'human',
          controllerId: 'player-1',
          startedAtTick: 0,
          endedAtTick: 40,
          scoreGained: 12,
        }],
      }],
    },
    historyTokenHash: 'history-token-hash',
    participantTokenHashes: { 'player-1': 'participant-token-hash' },
  };
}
