import db from './index.js';

const upsertStmt = db.prepare(`
  INSERT INTO diary_entries (operator_id, entry_date, weather, mood_weather, body, updated_at)
  VALUES (@operatorId, @entryDate, @weather, @moodWeather, @body, datetime('now'))
  ON CONFLICT(operator_id, entry_date) DO UPDATE SET
    weather = excluded.weather,
    mood_weather = excluded.mood_weather,
    body = excluded.body,
    updated_at = excluded.updated_at
`);
const byDateStmt = db.prepare(`SELECT * FROM diary_entries WHERE operator_id = ? AND entry_date = ?`);
const byMonthStmt = db.prepare(`
  SELECT entry_date, weather, mood_weather FROM diary_entries
  WHERE operator_id = ? AND entry_date >= ? AND entry_date < ?
  ORDER BY entry_date
`);

export function upsertDiaryEntry({ operatorId, entryDate, weather, moodWeather, body }) {
  upsertStmt.run({ operatorId, entryDate, weather, moodWeather, body });
  return byDateStmt.get(operatorId, entryDate);
}

export function getDiaryEntry(operatorId, entryDate) {
  return byDateStmt.get(operatorId, entryDate) ?? null;
}

/** month 는 1~12 (JS Date 의 0-index 와 다름 — API 쪽에서 헷갈리지 않도록). */
export function listDiaryEntriesForMonth(operatorId, year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad(nextMonth)}-01`;
  return byMonthStmt.all(operatorId, start, end);
}
