import os from 'node:os';

import 'dotenv/config';

const toList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const originsFromEnv = toList(process.env.CORS_ORIGINS);
const env = process.env.NODE_ENV ?? 'development';

// BOOTSTRAP_OPERATOR_EMAIL / _PASSWORD / _NAME (첫 번째 계정) 에 이어
// _EMAIL_2 / _PASSWORD_2 / _NAME_2, _EMAIL_3 ... 처럼 번호를 붙이면 여러 운영자를
// 한 번에 부트스트랩할 수 있다. Render 대시보드는 plain key/value 만 넣으면 되므로
// JSON 보다 이 방식이 다루기 쉽다. 번호가 끊기는 지점에서 스캔을 멈춘다.
function collectBootstrapOperators() {
  const operators = [];
  for (let i = 1; ; i += 1) {
    const suffix = i === 1 ? '' : `_${i}`;
    const email = process.env[`BOOTSTRAP_OPERATOR_EMAIL${suffix}`];
    const password = process.env[`BOOTSTRAP_OPERATOR_PASSWORD${suffix}`];
    if (!email || !password) break;
    operators.push({ email, password, name: process.env[`BOOTSTRAP_OPERATOR_NAME${suffix}`] || 'MC' });
  }
  return operators;
}

// 개발 중 스마트폰 테스트용 — 이 노트북의 LAN IP 를 전부 허용 출처에 넣는다.
// Wi-Fi 가 바뀌어 IP 가 달라져도 .env 를 고칠 필요가 없다. 운영에서는 쓰지 않는다
// (서버가 클라이언트 빌드를 함께 서빙해 동일 출처가 되므로).
function lanDevOrigins() {
  const origins = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) origins.push(`http://${net.address}:5173`);
    }
  }
  return origins;
}

export const config = {
  env,
  port: Number(process.env.PORT ?? 4000),

  // 개발 중에는 Vite 개발 서버(5173)에서 API/WebSocket 을 호출한다.
  // 운영에서는 서버가 클라이언트 빌드를 함께 서빙하므로 동일 출처가 된다.
  corsOrigins: originsFromEnv.length
    ? originsFromEnv
    : env === 'production'
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : ['http://localhost:5173', 'http://127.0.0.1:5173', ...lanDevOrigins()],

  // 테스트 등에서 별도 DB 파일을 쓰고 싶을 때만 지정. 기본은 server/data/recreation.sqlite.
  // 영구 디스크(볼륨)를 붙인 배포에서는 그 마운트 경로 아래를 가리키도록 지정한다
  // (예: Railway 볼륨을 /data 에 붙였다면 DB_PATH=/data/recreation.sqlite).
  dbPath: process.env.DB_PATH || undefined,
  uploadsDir: process.env.UPLOADS_DIR || undefined,

  maxLogoSizeBytes: 5 * 1024 * 1024, // 5MB

  sessionSecret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',

  // Shell 이 없는 무료 티어 배포용 — 지정된 각 계정을 부팅 시 없는 경우에만 만든다.
  bootstrapOperators: collectBootstrapOperators(),
};

export const isProd = config.env === 'production';
