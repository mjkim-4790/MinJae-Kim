// '나의 가치여정' 순수 로직. 소켓/DB 와 무관한 순수 함수만 둔다 (liarEngine.js/
// typingEngine.js/acrosticEngine.js 와 같은 원칙).

export const MIN_WORDS = 10;
export const MAX_WORDS = 15;
const WORD_MAX_LEN = 20;

export function normalizeWords(rawWords) {
  const list = Array.isArray(rawWords) ? rawWords : [];
  return list.map((w) => String(w ?? '').trim().slice(0, WORD_MAX_LEN)).filter((w) => w.length > 0);
}

export function isValidWordList(words) {
  return words.length >= MIN_WORDS && words.length <= MAX_WORDS;
}

/**
 * 단어 하나에 취소선을 긋는다. "끝까지 버리지 못한 단어를 찾는 게임"이 핵심이라
 * 마지막 1개는 항상 남겨야 한다 — 이미 1개만 남았으면 더 그을 수 없다. 한 번 그은
 * 취소선은 되돌릴 수 없다(운영 결정).
 * @param {string[]} words
 * @param {Set<number>} crossedIndices
 * @param {number} index
 * @returns {{ok:true, crossedIndices:Set<number>, done:boolean, finalWord:string|null} | {ok:false, error:string}}
 */
export function crossWord(words, crossedIndices, index) {
  if (!Number.isInteger(index) || index < 0 || index >= words.length) {
    return { ok: false, error: 'INVALID_INDEX' };
  }
  if (crossedIndices.has(index)) return { ok: false, error: 'ALREADY_CROSSED' };
  if (words.length - crossedIndices.size <= 1) return { ok: false, error: 'ONLY_ONE_LEFT' };

  const next = new Set(crossedIndices);
  next.add(index);
  const remainingIndex = words.findIndex((_, i) => !next.has(i));
  const done = words.length - next.size === 1;

  return { ok: true, crossedIndices: next, done, finalWord: done ? words[remainingIndex] : null };
}
