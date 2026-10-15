import { createApp } from './app.js';
import { db } from './db.js';
import { env } from './env.js';
import { startJobs } from './jobs.js';

const server = createApp().listen(env.PORT, () => console.log(`Recallr server on http://localhost:${env.PORT}`));
startJobs();

// Finish the requests in progress before stopping (deploys, restarts)
const shutdown = (signal: string) => {
  console.log(`${signal}: shutting down...`);
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
