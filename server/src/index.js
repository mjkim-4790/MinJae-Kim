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

const io = createRealtime(httpServer);
app.set('io', io); // REST 라우트에서 실시간 브로드캐스트가 필요할 때 사용 (예: 팀 배정)

httpServer.listen(config.port, () => {
  console.log(`[server] ${config.env} · http://localhost:${config.port}`);
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} 수신 — 종료합니다`);
  // 열려 있는 소켓(운영자/참여자/스크린 탭)이 남아있으면 httpServer.close() 콜백이
  // 영원히 안 불릴 수 있어 io.close()로 전부 끊어준다. 그래도 안 끝나면 강제 종료.
  const forceExit = setTimeout(() => process.exit(0), 3000);
  io.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
