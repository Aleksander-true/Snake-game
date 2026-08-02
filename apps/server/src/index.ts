import { createMultiplayerServer } from './createMultiplayerServer';

const port = Number(process.env.PORT ?? 3000);
const server = createMultiplayerServer();

server.start(port, '0.0.0.0')
  .then((address) => {
    process.stdout.write(`Snake multiplayer server listening on port ${address.port}\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(`Failed to start multiplayer server: ${String(error)}\n`);
    process.exitCode = 1;
  });
