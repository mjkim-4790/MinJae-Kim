import db from './index.js';

const insertStmt = db.prepare(`
  INSERT INTO game_records (event_id, game_type, result_json) VALUES (@eventId, @gameType, @resultJson)
`);
const listByEventStmt = db.prepare(
  `SELECT * FROM game_records WHERE event_id = ? ORDER BY id DESC`,
);

export function createGameRecord({ eventId, gameType, result }) {
  const info = insertStmt.run({ eventId, gameType, resultJson: JSON.stringify(result) });
  return { id: info.lastInsertRowid, eventId, gameType, result };
}

export function listGameRecordsByEvent(eventId) {
  return listByEventStmt.all(eventId).map((row) => ({
    id: row.id,
    gameType: row.game_type,
    result: JSON.parse(row.result_json),
    endedAt: row.ended_at,
  }));
}
