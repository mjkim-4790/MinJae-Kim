import { Router } from 'express';

import { verifyPassword } from '../auth/password.js';
import { requireOperator } from '../auth/middleware.js';
import { findByEmail, toPublic } from '../db/operators.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'EMAIL_PASSWORD_REQUIRED' });
  }

  const operator = findByEmail(email);
  // 존재하지 않는 이메일이어도 동일한 오류 메시지 — 계정 존재 여부 노출 방지
  const valid = operator ? await verifyPassword(password, operator.password_hash) : false;

  if (!valid) {
    return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'SESSION_ERROR' });
    req.session.operatorId = operator.id;
    res.json({ ok: true, operator: toPublic(operator) });
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('recreation.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireOperator, (req, res) => {
  res.json({ ok: true, operator: req.operator });
});
