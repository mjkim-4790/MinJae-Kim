// 서버(server/src/game/typingSentences.js)의 난이도 목록과 id/이름을 맞춰서 들고 있는다
// (liarCategories.js 와 같은 관례 — 실제 문장은 서버에만 있다).

export const MANUAL_DIFFICULTY_ID = 'manual';

export const DIFFICULTIES = [
  { id: 'hard', name: '상' },
  { id: 'medium', name: '중' },
  { id: 'easy', name: '하' },
  { id: MANUAL_DIFFICULTY_ID, name: '직접 작성' },
];

// 경과시간(ms) → "3.42초" 같은 표시용 문자열
export function formatElapsedMs(ms) {
  if (ms == null) return '-';
  return `${(ms / 1000).toFixed(2)}초`;
}
