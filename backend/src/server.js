import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { createServer } from 'http';
import { attachRecordingWebSocket } from './websocket/recording.socket.js';

const app = createApp();
const server = createServer(app);

attachRecordingWebSocket(server);

server.listen(env.PORT, () => {
  logger.info(`AI Meeting Assistant backend listening on ${env.PORT}`);
});

const shutdown = async () => {
  logger.info('Shutting down backend');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
