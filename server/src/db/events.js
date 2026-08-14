import db from './index.js';

const MAX_CODE_ATTEMPTS = 20;

const insertStmt = db.prepare(`
  INSERT INTO events (operator_id, code, name, mode, max_participants, logo_path, scheduled_at)
  VALUES (@operatorId, @code, @name, @mode, @maxParticipants, @logoPath, @scheduledAt)
`);
const byIdStmt = db.prepare(`SELECT * FROM events WHERE id = ?`);
const byOperatorStmt = db.prepare(
  `SELECT * FROM events WHERE operator_id = ? ORDER BY datetime(created_at) DESC`,
);
// 코드로 참여 가능한(종료되지 않은) 이벤트 찾기 — 참여자 입장 흐름에서 사용
const byActiveCodeStmt = db.prepare(
  `SELECT * FROM events WHERE code = ? AND status != 'ended' ORDER BY id DESC LIMIT 1`,
);
const setStatusStmt = db.prepare(
  `UPDATE events SET status = @status, ended_at = @endedAt WHERE id = @id`,
);

function randomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export function createEvent({
  operatorId,
  name,
  mode = 'individual',
  maxParticipants = 50,
  logoPath = null,
  scheduledAt = null,
}) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    try {
      const info = insertStmt.run({
        operatorId,
        code,
        name,
        mode,
        maxParticipants,
        logoPath,
        scheduledAt,
      });
      return getEventById(info.lastInsertRowid);
    } catch (err) {
      // 진행 중/대기 중인 이벤트끼리 코드가 겹치면 재시도 (idx_events_active_code)
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && attempt < MAX_CODE_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw new Error('사용 가능한 참여 코드를 찾지 못했습니다. 잠시 후 다시 시도하세요.');
}

export function getEventById(id) {
  return byIdStmt.get(id) ?? null;
}

export function getJoinableEventByCode(code) {
  return byActiveCodeStmt.get(code) ?? null;
}

export function listEventsByOperator(operatorId) {
  return byOperatorStmt.all(operatorId);
}

export function setEventStatus(id, status) {
  const endedAt = status === 'ended' ? new Date().toISOString() : null;
  setStatusStmt.run({ id, status, endedAt });
  return getEventById(id);
}
