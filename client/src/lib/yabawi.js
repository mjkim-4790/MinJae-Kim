// 서버(server/src/game/yabawiEngine.js)의 난이도 표와 id/이름을 맞춰서 들고 있는다
// (typing.js 와 같은 관례 — 실제 판정과 섞기 순서는 서버가 만든다).

export const DIFFICULTIES = [
  { id: 'easy', name: '하', desc: '컵 3개', points: 50 },
  { id: 'medium', name: '중', desc: '컵 5개', points: 100 },
  { id: 'hard', name: '상', desc: '컵 5개 · 빠르게', points: 150 },
];

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) ?? null;
}

/** 섞기가 끝난 뒤 각 자리에 어떤 컵이 있는지 / 각 컵이 어느 자리에 있는지 계산한다.
 * 서버의 trackBall 과 같은 규칙(스왑은 "자리끼리" 맞바꾼다)을 따른다. */
export function resolveFinalPositions({ cups, swaps }) {
  const cupAtSlot = Array.from({ length: cups }, (_, i) => i);
  const slotOfCup = Array.from({ length: cups }, (_, i) => i);

  for (const [sa, sb] of swaps) {
    const ca = cupAtSlot[sa];
    const cb = cupAtSlot[sb];
    cupAtSlot[sa] = cb;
    cupAtSlot[sb] = ca;
    slotOfCup[ca] = sb;
    slotOfCup[cb] = sa;
  }

  return { cupAtSlot, slotOfCup };
}
