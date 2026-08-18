import { SENTENCES } from './typingSentences.js';

// '메시지 빨리 보내기' 순수 로직 (rpsEngine.js/liarEngine.js 와 같은 관례 — 무작위/판정
// 로직은 여기, 원시 데이터는 typingSentences.js 에 둔다).

export const MANUAL_DIFFICULTY_ID = 'manual';

export function randomSentence(difficultyId) {
  const pool = SENTENCES[difficultyId];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function normalizeSentence(text) {
  return String(text ?? '').trim();
}

// 오타/누락 없이 제시 문장과 정확히 같아야 "완료"로 인정한다 (사용자 결정 — 타이핑
// 실력 게임이므로 정확성이 핵심).
export function isMatch(submitted, target) {
  const a = normalizeSentence(submitted);
  const b = normalizeSentence(target);
  return a.length > 0 && a === b;
}

// 제출 시각(ms, 게임 시작 기준 경과시간)이 빠른 순서로 등수를 매긴다.
export function rankSubmissions(submissionsMap) {
  return [...submissionsMap.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([participantId, elapsedMs], i) => ({ participantId, elapsedMs, rank: i + 1 }));
}
