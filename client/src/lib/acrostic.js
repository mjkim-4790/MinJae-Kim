// 서버(server/src/game/acrosticEngine.js)와 맞춰 두는 삼행시 공용 값·헬퍼
// (typing.js/liarCategories.js 와 같은 관례 — 판정은 전부 서버가 한다).

export const MIN_SYLLABLES = 2;
export const MAX_SYLLABLES = 5;

/** 제시어를 글자 배열로 쪼갠다 (서버 splitPrompt 와 동일 규칙 — 공백 무시). */
export function splitPrompt(text) {
  return [...String(text ?? '').replace(/\s+/g, '')];
}

/** 앞글자 + 뒷부분을 합쳐 한 줄로 보여준다 ("민" + "재야 안녕" → "민재야 안녕"). */
export function composeLine(syllable, tail) {
  return `${syllable}${tail ?? ''}`;
}

/** 작품 하나를 화면에 보여줄 문자열 배열로 만든다. */
export function composeEntry(syllables, lines) {
  return syllables.map((s, i) => composeLine(s, lines?.[i]));
}
