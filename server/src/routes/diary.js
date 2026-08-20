import { Router } from 'express';

import { requireOperator } from '../auth/middleware.js';
import { getDiaryEntry, listDiaryEntriesForMonth, upsertDiaryEntry } from '../db/diaryEntries.js';

export const diaryRouter = Router();
diaryRouter.use(requireOperator);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_MAX_LEN = { weather: 8, moodWeather: 8, body: 4000 };

function toPublicEntry(entry) {
  if (!entry) return null;
  return {
    date: entry.entry_date,
    weather: entry.weather,
    moodWeather: entry.mood_weather,
    body: entry.body,
    updatedAt: entry.updated_at,
  };
}

// 달력에 크레파스 X 를 표시할 날짜만 가볍게 — 본문은 안 실어 보낸다.
diaryRouter.get('/', (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ ok: false, error: 'INVALID_MONTH' });
  }

  const entries = listDiaryEntriesForMonth(req.operator.id, year, month);
  res.json({
    ok: true,
    entries: entries.map((e) => ({ date: e.entry_date, weather: e.weather, moodWeather: e.mood_weather })),
  });
});

diaryRouter.get('/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ ok: false, error: 'INVALID_DATE' });
  res.json({ ok: true, entry: toPublicEntry(getDiaryEntry(req.operator.id, req.params.date)) });
});

diaryRouter.put('/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ ok: false, error: 'INVALID_DATE' });

  const weather = String(req.body?.weather ?? '').trim().slice(0, FIELD_MAX_LEN.weather);
  const moodWeather = String(req.body?.moodWeather ?? '').trim().slice(0, FIELD_MAX_LEN.moodWeather);
  const body = String(req.body?.body ?? '').trim().slice(0, FIELD_MAX_LEN.body);

  if (!weather || !moodWeather || !body) {
    return res.status(400).json({ ok: false, error: 'FIELDS_REQUIRED' });
  }

  const entry = upsertDiaryEntry({
    operatorId: req.operator.id,
    entryDate: req.params.date,
    weather,
    moodWeather,
    body,
  });
  res.json({ ok: true, entry: toPublicEntry(entry) });
});
