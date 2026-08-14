import session from 'express-session';

import { config, isProd } from '../config.js';

// 설계문서 §3.3 — "이메일+비밀번호 세션 로그인 (자체 구현, 단순하게)".
// MemoryStore 는 서버 재시작 시 세션이 날아가지만, 행사 중에는 계속 트래픽이 있어
// 무료 티어가 슬립하지 않으므로 시험 단계에서는 이 정도로 충분하다 (§9 결정 참고).
export const sessionMiddleware = session({
  secret: config.sessionSecret,
  name: 'recreation.sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 12, // 12시간 — 행사 하루 기준
  },
});
