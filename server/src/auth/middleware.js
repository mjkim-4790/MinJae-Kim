import { byId, toPublic } from '../db/operators.js';

export function requireOperator(req, res, next) {
  const operatorId = req.session?.operatorId;
  if (!operatorId) {
    return res.status(401).json({ ok: false, error: 'LOGIN_REQUIRED' });
  }

  const operator = byId(operatorId);
  if (!operator) {
    req.session.destroy(() => {});
    return res.status(401).json({ ok: false, error: 'LOGIN_REQUIRED' });
  }

  req.operator = toPublic(operator);
  next();
}
