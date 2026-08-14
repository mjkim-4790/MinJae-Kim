import http from 'node:http';

import { createApp } from './app.js';
import { config } from './config.js';
import { createRealtime } from './realtime/index.js';

const app = createApp();
const httpServer = http.createServer(app);

createRealtime(httpServer);

httpServer.listen(config.port, () => {
  console.log(`[server] ${config.env} · http://localhost:${config.port}`);
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} 수신 — 종료합니다`);
  httpServer.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
