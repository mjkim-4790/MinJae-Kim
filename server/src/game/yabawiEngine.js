// '야바위 게임' 순수 로직. 소켓/DB 와 무관한 순수 함수만 둔다
// (rpsEngine.js/valuesEngine.js 와 같은 원칙 — "서버가 유일한 진실").
//
// 섞기 순서는 서버가 미리 전부 계산해서 한 번에 내려보낸다. 각 기기는 그걸 받아
// 로컬에서 재생하기만 하므로, 스왑마다 네트워크를 왕복하지 않아 끊김이 없다
// (프레임 유지가 이 게임의 핵심 요구사항 — 사용자 결정).

export const DIFFICULTIES = [
  // 상만 속도가 빨라진다(swapDurationMs 가 짧아짐). 섞는 횟수도 난이도별로 늘린다(사용자 결정).
  { id: 'easy', name: '하', cups: 3, swaps: 8, swapDurationMs: 480, points: 50 },
  { id: 'medium', name: '중', cups: 5, swaps: 12, swapDurationMs: 420, points: 100 },
  { id: 'hard', name: '상', cups: 5, swaps: 16, swapDurationMs: 260, points: 150 },
];

/** 처음에 공을 보여주고 컵을 덮는 데 쓰는 시간(ms). 난이도와 무관하게 같다. */
export const PLACE_MS = 1100;

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) ?? null;
}

/** 이 난이도로 한 판을 돌릴 때 애니메이션이 끝나기까지 걸리는 총 시간(ms). */
export function totalAnimationMs(difficulty) {
  return PLACE_MS + difficulty.swaps * difficulty.swapDurationMs;
}

/**
 * 섞기 순서를 만든다. 각 원소 [a, b] 는 "a번 자리와 b번 자리의 컵을 맞바꾼다"는 뜻이다.
 * 같은 쌍이 연달아 두 번 나오면 제자리로 돌아와 헛도는 것처럼 보이므로 피한다.
 */
export function generateSwaps(cupCount, swapCount, random = Math.random) {
  const swaps = [];
  let previous = null;

  for (let i = 0; i < swapCount; i += 1) {
    let a;
    let b;
    do {
      a = Math.floor(random() * cupCount);
      b = Math.floor(random() * cupCount);
    } while (a === b || (previous && ((previous[0] === a && previous[1] === b) || (previous[0] === b && previous[1] === a))));

    swaps.push([a, b]);
    previous = [a, b];
  }

  return swaps;
}

/**
 * 공이 든 컵이 섞기 후 몇 번 자리에 있는지 따라간다.
 * 자리 기준으로 추적한다 — 스왑이 a자리와 b자리를 맞바꾸므로, 공이 a에 있었으면 b로 간다.
 */
export function trackBall(initialSlot, swaps) {
  let slot = initialSlot;
  for (const [a, b] of swaps) {
    if (slot === a) slot = b;
    else if (slot === b) slot = a;
  }
  return slot;
}

/**
 * 한 판 판정. 정답 자리를 고른 사람만 생존하고 나머지(무응답 포함)는 탈락한다.
 * @param {number[]} activePool 이번 판 참여자 id
 * @param {Map<number, number>} picks participantId -> 고른 자리 index
 * @param {number} answerSlot 공이 실제로 있는 자리
 */
export function judgeRound(activePool, picks, answerSlot) {
  const survivorIds = [];
  const eliminatedIds = [];

  for (const id of activePool) {
    if (picks.get(id) === answerSlot) survivorIds.push(id);
    else eliminatedIds.push(id);
  }

  return { survivorIds, eliminatedIds };
}

/**
 * 판정 결과로 다음 상태를 정한다.
 *  - 전멸(아무도 못 맞힘): 아무도 탈락시키지 않고 같은 인원으로 다시 한다 (rpsEngine 의 wipeout 과 같은 취지).
 *  - 생존자 1명 이하: 게임 종료.
 *  - 그 외: 생존자끼리 다음 판.
 */
export function resolveRound({ activePool, survivorIds, eliminatedIds }) {
  if (survivorIds.length === 0) {
    return { outcome: 'wipeout', nextActivePool: activePool, eliminatedIds: [] };
  }
  if (survivorIds.length === 1) {
    return { outcome: 'ended', nextActivePool: survivorIds, eliminatedIds };
  }
  return { outcome: 'continue', nextActivePool: survivorIds, eliminatedIds };
}
