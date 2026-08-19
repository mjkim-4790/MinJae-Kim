// 삼행시 게임 판정 로직. 소켓/DB 와 무관한 순수 함수만 둔다 (liarEngine.js/typingEngine.js
// 와 같은 원칙 — "서버가 유일한 진실", 집계는 전부 여기서 하고 클라이언트는 표시만 한다).
//
// 이름은 '삼행시'지만 제시어 글자 수는 2~5자까지 허용한다 (운영 결정 — 회사명 4글자,
// 2행시 같은 변형을 현장에서 그대로 쓸 수 있게).

export const MIN_SYLLABLES = 2;
export const MAX_SYLLABLES = 5;

const LINE_MAX = 60; // 한 줄에 적을 수 있는 글자 수

/** 제시어를 글자 배열로 쪼갠다. 공백은 무시한다 ("민 재" → ['민','재']). */
export function splitPrompt(text) {
  const compact = String(text ?? '').replace(/\s+/g, '');
  return [...compact];
}

export function isValidPrompt(syllables) {
  return syllables.length >= MIN_SYLLABLES && syllables.length <= MAX_SYLLABLES;
}

/**
 * 참여자가 보낸 줄들을 제시어 글자 수에 맞춰 정리한다.
 * 각 줄에는 앞글자를 뺀 "뒷부분"만 담긴다 (앞글자는 제시어에서 그대로 붙여 보여준다).
 * @returns {string[]|null} 전부 빈 줄이면 null (제출로 인정하지 않는다)
 */
export function normalizeLines(lines, syllableCount) {
  const source = Array.isArray(lines) ? lines : [];
  const normalized = Array.from({ length: syllableCount }, (_, i) =>
    String(source[i] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LINE_MAX),
  );
  return normalized.some((line) => line.length > 0) ? normalized : null;
}

/** Fisher–Yates. 투표 화면에서 제출 순서로 작성자가 유추되지 않도록 섞는다. */
export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 득표를 집계한다.
 * @param {Map<number, number>} votes voterId -> entryId
 * @returns {Map<number, number>} entryId -> 득표수
 */
export function tallyVotes(votes) {
  const counts = new Map();
  for (const entryId of votes.values()) {
    counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
  }
  return counts;
}

/**
 * 득표수 내림차순으로 등수를 매긴다. 동점은 같은 등수를 주고 그만큼 다음 등수를
 * 건너뛴다 (1,1,3 — 스포츠식). 0표도 순위에는 들어가지만, 점수는 realtime/acrostic.js
 * 에서 "득표가 있는 1등"에게만 준다 (아무도 투표 안 했는데 전원 1등이 되는 걸 막는다).
 */
export function rankEntries(entries, counts) {
  const scored = entries
    .map((entry) => ({ ...entry, votes: counts.get(entry.entryId) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);

  let lastVotes = null;
  let lastRank = 0;
  return scored.map((entry, i) => {
    const rank = entry.votes === lastVotes ? lastRank : i + 1;
    lastVotes = entry.votes;
    lastRank = rank;
    return { ...entry, rank };
  });
}
