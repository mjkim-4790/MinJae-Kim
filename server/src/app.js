import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json());

  // 헬스 체크 — 무료 티어 슬립 여부 확인 및 행사 전 서버 깨우기용 (설계문서 §3.3)
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      env: config.env,
      uptimeSec: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    });
  });

  // 운영 빌드가 존재하면 클라이언트를 같은 서버에서 서빙 (무료 티어 단일 서비스 배포)
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
