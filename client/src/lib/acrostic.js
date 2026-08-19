// 서버(server/src/game/acrosticEngine.js)와 맞춰 두는 삼행시 공용 값·헬퍼
// (typing.js/liarCategories.js 와 같은 관례 — 판정은 전부 서버가 한다).

export const MIN_SYLLABLES = 2;
export const MAX_SYLLABLES = 5;

// 시작에 필요한 최소 참여자 수. 투표가 의미 있으려면 2명 이상이지만, 1명일 때도
// 시작은 되게 둔다 — 운영자가 혼자 리허설해볼 수 있어야 하고, 참여자가 한 명뿐인
// 상태에서 버튼이 이유 없이 막히면 고장으로 보인다 (서버 값과 반드시 맞출 것).
export const MIN_PARTICIPANTS = 1;

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
