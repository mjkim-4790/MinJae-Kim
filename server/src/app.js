import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { sessionMiddleware } from './auth/session.js';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { diaryRouter } from './routes/diary.js';
import { eventsRouter } from './routes/events.js';
import { uploadsDir } from './uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render/Railway 등 프록시 뒤에서 secure 쿠키 판정용
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(sessionMiddleware);

  // 헬스 체크 — 무료 티어 슬립 여부 확인 및 행사 전 서버 깨우기용 (설계문서 §3.3)
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      env: config.env,
      uptimeSec: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/diary', diaryRouter);
  app.use('/uploads', express.static(uploadsDir));

  // 운영 빌드가 존재하면 클라이언트를 같은 서버에서 서빙 (무료 티어 단일 서비스 배포)
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api|socket\.io|uploads).*/, (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
