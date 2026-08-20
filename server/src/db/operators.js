import db from './index.js';

const insertStmt = db.prepare(
  `INSERT INTO operators (email, password_hash, name, account_type)
   VALUES (@email, @passwordHash, @name, @accountType)`,
);
const byEmailStmt = db.prepare(`SELECT * FROM operators WHERE email = ?`);
const byIdStmt = db.prepare(`SELECT * FROM operators WHERE id = ?`);
const allStmt = db.prepare(`SELECT id, email, name, account_type, created_at FROM operators ORDER BY id`);

export function createOperator({ email, passwordHash, name, accountType = 'mc' }) {
  const info = insertStmt.run({ email, passwordHash, name, accountType });
  return byId(info.lastInsertRowid);
}

export function findByEmail(email) {
  return byEmailStmt.get(email) ?? null;
}

export function byId(id) {
  return byIdStmt.get(id) ?? null;
}

export function listOperators() {
  return allStmt.all();
}

export function toPublic(operator) {
  if (!operator) return null;
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    accountType: operator.account_type,
  };
}
