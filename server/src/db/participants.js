import db from './index.js';

const insertStmt = db.prepare(`
  INSERT INTO participants (event_id, nickname, pin) VALUES (@eventId, @nickname, @pin)
`);
const findStmt = db.prepare(
  `SELECT * FROM participants WHERE event_id = ? AND nickname = ? AND pin = ?`,
);
const byIdStmt = db.prepare(`SELECT * FROM participants WHERE id = ?`);
const listByEventStmt = db.prepare(
  `SELECT * FROM participants WHERE event_id = ? ORDER BY score DESC, joined_at ASC`,
);
const countActiveStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM participants WHERE event_id = ? AND status != 'removed'`,
);
const touchStmt = db.prepare(
  `UPDATE participants SET last_seen_at = datetime('now') WHERE id = ?`,
);
const setStatusStmt = db.prepare(`UPDATE participants SET status = ? WHERE id = ?`);

export function findParticipant(eventId, nickname, pin) {
  return findStmt.get(eventId, nickname, pin) ?? null;
}

export function getParticipantById(id) {
  return byIdStmt.get(id) ?? null;
}

export function createParticipant({ eventId, nickname, pin }) {
  const info = insertStmt.run({ eventId, nickname, pin });
  return getParticipantById(info.lastInsertRowid);
}

export function listParticipantsByEvent(eventId) {
  return listByEventStmt.all(eventId);
}

export function countActiveParticipants(eventId) {
  return countActiveStmt.get(eventId).n;
}

export function touchLastSeen(id) {
  touchStmt.run(id);
}

export function setParticipantStatus(id, status) {
  setStatusStmt.run(status, id);
  return getParticipantById(id);
}
