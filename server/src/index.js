import http from 'node:http';

import { createApp } from './app.js';
import { config, isProd } from './config.js';
import { createRealtime } from './realtime/index.js';

if (isProd && config.sessionSecret === 'dev-only-insecure-secret-change-me') {
  console.error('[server] SESSION_SECRET 이 개발용 기본값입니다. 운영 배포 전 .env 에서 교체하세요.');
  process.exit(1);
}

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
