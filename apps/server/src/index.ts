import { createMultiplayerServer } from './createMultiplayerServer';
import type { MatchHistoryRepository } from './multiplayer/MatchHistoryRepository';

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.MATCH_HISTORY_DB;

startServer().catch((error: unknown) => {
  process.stderr.write(`Failed to start multiplayer server: ${String(error)}\n`);
  process.exitCode = 1;
});

async function startServer(): Promise<void> {
  const historyRepository = await createHistoryRepository(databasePath);
  const server = createMultiplayerServer({
    staticDirectory: process.env.STATIC_DIR,
    historyRepository,
    onHistoryPersistenceError: (error) => {
      process.stderr.write(`Failed to save multiplayer history: ${String(error)}\n`);
    },
  });
  const address = await server.start(port, '0.0.0.0');
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`Received ${signal}; shutting down multiplayer server\n`);
    try {
      await server.close();
    } catch (error) {
      process.stderr.write(`Failed to stop multiplayer server: ${String(error)}\n`);
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.stdout.write(`Snake multiplayer server listening on port ${address.port}\n`);
}

async function createHistoryRepository(
  path: string | undefined,
): Promise<MatchHistoryRepository | undefined> {
  if (!path) return undefined;
  const { SqliteMatchHistoryRepository } = await import(
    './multiplayer/SqliteMatchHistoryRepository'
  );
  return new SqliteMatchHistoryRepository(path);
}
