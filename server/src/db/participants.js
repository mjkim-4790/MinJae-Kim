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
const addScoreStmt = db.prepare(`UPDATE participants SET score = score + ? WHERE id = ?`);
const setTeamStmt = db.prepare(`UPDATE participants SET team_id = ? WHERE id = ?`);
const teamScoresStmt = db.prepare(`
  SELECT team_id AS teamId, SUM(score) AS total, COUNT(*) AS memberCount
  FROM participants
  WHERE event_id = ? AND status != 'removed' AND team_id IS NOT NULL
  GROUP BY team_id
  ORDER BY total DESC
`);

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

export function addScore(participantId, delta) {
  addScoreStmt.run(delta, participantId);
  return getParticipantById(participantId);
}

/** 팀별 합산 점수 (§9 결정 — 팀 순위 = 팀원 개인 점수 합산) */
export function listTeamScores(eventId) {
  return teamScoresStmt.all(eventId);
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 현재 활성 참여자를 teamCount 개 팀에 균등 랜덤 배정한다 (§9 결정).
 * 다시 호출하면 전체를 새로 섞어 재배정한다.
 */
export function assignRandomTeams(eventId, teamCount) {
  const participants = listByEventStmt.all(eventId).filter((p) => p.status !== 'removed');
  const shuffled = shuffle(participants);
  const tx = db.transaction((rows) => {
    rows.forEach((p, index) => {
      setTeamStmt.run(String((index % teamCount) + 1), p.id);
    });
  });
  tx(shuffled);
  return listByEventStmt.all(eventId);
}
