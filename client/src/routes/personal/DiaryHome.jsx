import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import CrayonCrossMark from '../../components/CrayonCrossMark.jsx';
import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { api } from '../../lib/api.js';
import { getMonthGrid, WEEKDAY_LABELS } from '../../lib/calendar.js';
import { formatKoreanDate, toISODate, WEATHER_OPTIONS } from '../../lib/diary.js';
import { springDrawer, springSettle } from '../../lib/motionPresets.js';

const today = new Date();
const todayISO = toISODate(today);

/** 달력이 시트에 자리를 내주며 뒤로 살짝 물러나는 정도 (§7 공간 일관성 — 시트가
 * 나타난 방향과 같은 리듬으로 움직인다). */
const calendarRecede = {
  rest: { scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' },
  receded: { scale: 0.9, y: -16, opacity: 0.5, filter: 'blur(1.5px)' },
};

export default function DiaryHome() {
  const [doneDates, setDoneDates] = useState(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [weather, setWeather] = useState(null);
  const [moodWeather, setMoodWeather] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listDiaryMonth(today.getFullYear(), today.getMonth() + 1)
      .then((res) => setDoneDates(new Set(res.entries.map((e) => e.date))))
      .catch(() => {});
  }, []);

  const openToday = async () => {
    setError(null);
    setSheetOpen(true);
    try {
      const res = await api.getDiaryEntry(todayISO);
      if (res.entry) {
        setWeather(res.entry.weather);
        setMoodWeather(res.entry.moodWeather);
        setBody(res.entry.body);
      }
    } catch {
      // 아직 오늘 쓴 게 없으면 조용히 빈 폼으로 시작한다
    }
  };

  const closeSheet = () => setSheetOpen(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveDiaryEntry(todayISO, { weather, moodWeather, body });
      setDoneDates((cur) => new Set(cur).add(todayISO));
      setSheetOpen(false);
    } catch {
      setError('저장에 실패했습니다. 다시 시도해주세요');
    } finally {
      setBusy(false);
    }
  };

  const cells = getMonthGrid(today.getFullYear(), today.getMonth());
  const canSubmit = weather && moodWeather && body.trim().length > 0;

  return (
    <PersonalLayout>
      <main className="page personal-home diary-home">
        <motion.section
          className="home-cal"
          initial="rest"
          animate={sheetOpen ? 'receded' : 'rest'}
          variants={calendarRecede}
          transition={springDrawer}
        >
          <div className="home-cal__head">
            <span className="home-cal__eyebrow">나의 일기 (가족 일정 달력과는 별개)</span>
            <span className="home-cal__month">
              {today.getFullYear()}년 {today.getMonth() + 1}월
            </span>
          </div>
          <div className="home-cal__weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="home-cal__grid">
            {cells.map((cell, i) => {
              if (!cell.date) return <span key={i} className="cal-cell" />;
              const iso = toISODate(new Date(today.getFullYear(), today.getMonth(), cell.date));
              const isToday = iso === todayISO;
              const isDone = doneDates.has(iso);
              return (
                <button
                  key={i}
                  type="button"
                  className={`cal-cell${isToday ? ' cal-cell--today' : ''}${isDone ? ' cal-cell--done' : ''}`}
                  onClick={isToday ? openToday : undefined}
                  disabled={!isToday}
                  aria-label={isToday ? `오늘(${cell.date}일) 일기 쓰기` : `${cell.date}일`}
                >
                  <span className="cal-cell__num">
                    {cell.date}
                    {isDone && <CrayonCrossMark />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="home-cal__foot">오늘 날짜만 눌러서 쓸 수 있어요. 완료한 날은 레드오커 색연필로 X 표시돼요.</p>
        </motion.section>

        <AnimatePresence>
          {sheetOpen && (
            <motion.div
              className="sheet-scrim"
              onClick={closeSheet}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springSettle}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sheetOpen && (
            <motion.div
              className="write-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springDrawer}
            >
              <span className="write-sheet__handle" aria-hidden="true" />
              <span className="write-sheet__date">{formatKoreanDate(today)}</span>

              <div className="write-field">
                <span className="write-field__label">오늘 날씨</span>
                <div className="emoji-row">
                  {WEATHER_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`emoji-pick${weather === w ? ' emoji-pick--active' : ''}`}
                      onClick={() => setWeather(w)}
                      aria-label={`날씨 ${w}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="write-field">
                <span className="write-field__label">내 마음 날씨</span>
                <div className="emoji-row">
                  {WEATHER_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`emoji-pick${moodWeather === w ? ' emoji-pick--active' : ''}`}
                      onClick={() => setMoodWeather(w)}
                      aria-label={`마음 날씨 ${w}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <label className="write-field" style={{ flex: 1 }}>
                <span className="write-field__label">오늘 있었던 일</span>
                <textarea
                  className="write-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="오늘 하루는 어땠나요? 자유롭게 적어보세요"
                  maxLength={4000}
                />
              </label>

              {error && <p className="error-text">{error}</p>}

              <button className="write-sheet__submit" disabled={busy || !canSubmit} onClick={submit}>
                {busy ? '저장하는 중…' : '완료'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </PersonalLayout>
  );
}
