// 단어 구름 게임의 순수 로직 (DB·소켓 의존 없음 — yabawiEngine.js 와 같은 방침).
//
// 이 게임은 "실시간으로 자라는" 방식이다 (운영 결정): 참여자가 낸 단어가 즉시
// 대형화면에 반영되고, 진행자는 '마감'으로 더 이상 못 내게만 막는다.
// 그래서 여기에는 승패 판정이 없고, 정규화·검증·집계만 있다.

export const MODES = [
  { id: 'buttons', name: '버튼 선택', desc: '진행자가 정한 단어를 누른다' },
  { id: 'text', name: '직접 입력', desc: '참여자가 단어를 적어 낸다' },
];

export const MAX_WORD_LEN = 12; // 구름에 올려도 읽히는 길이의 상한
export const MIN_PRESET_WORDS = 2;
export const MAX_PRESET_WORDS = 12; // 폰 화면에 버튼으로 다 들어가는 개수
export const MAX_PROMPT_LEN = 40;
export const MAX_DISTINCT_WORDS = 150; // 화면·메모리 보호 (이걸 넘으면 새 단어를 안 받는다)
export const MAX_BURST = 20; // 연타 1회 전송에 담을 수 있는 최대 횟수

export function modeById(id) {
  return MODES.find((m) => m.id === id) ?? null;
}

/**
 * 같은 뜻인데 따로 세어지는 걸 막는다.
 * 앞뒤 공백·구두점을 털고, 가운데 연속 공백은 하나로, 영문은 소문자로 모은다.
 * (한글은 소문자 개념이 없어 그대로 통과한다.)
 *
 * @returns {string|null} 쓸 수 없는 입력이면 null
 */
export function normalizeWord(raw) {
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 폰 키보드가 끼워넣는 보이지 않는 문자 제거
    .trim()
    .replace(/\s+/g, ' ')
    // 앞뒤 구두점만 턴다 ("행복!" 과 "행복" 이 따로 세어지는 걸 막는 게 목적).
    // 기호(\p{S})는 건드리지 않는다 — 이모지 한 글자를 단어로 내는 쓰임이 있다.
    .replace(/^\p{P}+|\p{P}+$/gu, '')
    .trim();

  if (!cleaned) return null;
  if ([...cleaned].length > MAX_WORD_LEN) return null;

  return cleaned.toLowerCase();
}

/** 진행자가 미리 정해둔 버튼 단어 목록을 정리한다. 중복은 합치고 순서는 유지한다. */
export function normalizePresetWords(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rawList) {
    const word = normalizeWord(raw);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= MAX_PRESET_WORDS) break;
  }
  return out;
}

export function isValidPreset(words) {
  return Array.isArray(words) && words.length >= MIN_PRESET_WORDS;
}

export function normalizePrompt(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  return [...cleaned].slice(0, MAX_PROMPT_LEN).join('');
}

/** 연타로 올라온 횟수를 안전한 범위로 자른다 (음수·소수·폭주 방지). */
export function clampBurst(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, MAX_BURST);
}

/**
 * 집계 결과를 화면에 올릴 순서로 정렬한다.
 * 횟수 내림차순, 같으면 가나다순 — 같은 횟수일 때 순서가 매번 바뀌면
 * 실시간 갱신에서 단어들이 이유 없이 자리를 옮기기 때문이다.
 */
export function tally(counts) {
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => (b.count - a.count) || a.word.localeCompare(b.word, 'ko'));
}

/** 가장 많이 나온 단어들 (동점이면 모두). 결과 기록·화면 강조용. */
export function topWords(counts) {
  const ranked = tally(counts);
  if (ranked.length === 0) return [];
  const max = ranked[0].count;
  return ranked.filter((r) => r.count === max);
}
