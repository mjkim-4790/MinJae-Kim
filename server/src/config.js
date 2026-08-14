import 'dotenv/config';

const toList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const originsFromEnv = toList(process.env.CORS_ORIGINS);

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),

  // 개발 중에는 Vite 개발 서버(5173)에서 API/WebSocket 을 호출한다.
  // 운영에서는 서버가 클라이언트 빌드를 함께 서빙하므로 동일 출처가 된다.
  corsOrigins: originsFromEnv.length
    ? originsFromEnv
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
};

export const isProd = config.env === 'production';
