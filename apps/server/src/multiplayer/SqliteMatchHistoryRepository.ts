import { DatabaseSync } from 'node:sqlite';
import type { PublicMatchHistorySummaryDTO } from '@snake-game/contracts';
import {
  type MatchHistoryRecord,
  type MatchHistoryRepository,
  toPublicMatchHistorySummary,
} from './MatchHistoryRepository';

interface StoredRecordRow {
  record_json: string;
}

export class SqliteMatchHistoryRepository implements MatchHistoryRepository {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS match_history (
        match_id TEXT PRIMARY KEY,
        visibility TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS match_history_public_finished_at
        ON match_history (visibility, finished_at DESC);
    `);
  }

  async save(record: MatchHistoryRecord): Promise<void> {
    this.requireOpen();
    this.database.prepare(`
      INSERT INTO match_history (match_id, visibility, finished_at, record_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        visibility = excluded.visibility,
        finished_at = excluded.finished_at,
        record_json = excluded.record_json
    `).run(
      record.history.matchId,
      record.history.visibility,
      record.history.finishedAt,
      JSON.stringify(record),
    );
  }

  async getByMatchId(matchId: string): Promise<MatchHistoryRecord | null> {
    this.requireOpen();
    const row = this.database.prepare(
      'SELECT record_json FROM match_history WHERE match_id = ?',
    ).get(matchId) as unknown as StoredRecordRow | undefined;
    return row ? parseRecord(row.record_json) : null;
  }

  async listPublic(limit: number): Promise<PublicMatchHistorySummaryDTO[]> {
    this.requireOpen();
    const rows = this.database.prepare(`
      SELECT record_json
      FROM match_history
      WHERE visibility = 'public'
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(Math.max(0, limit)) as unknown as StoredRecordRow[];
    return rows.map((row) => toPublicMatchHistorySummary(parseRecord(row.record_json).history));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private requireOpen(): void {
    if (this.closed) throw new Error('Match history repository is closed');
  }
}

function parseRecord(serialized: string): MatchHistoryRecord {
  return JSON.parse(serialized) as MatchHistoryRecord;
}
