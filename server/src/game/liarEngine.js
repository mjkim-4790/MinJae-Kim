// 라이어 게임 판정 로직. 소켓/DB 와 무관한 순수 함수만 둔다 (rpsEngine.js 와 같은 원칙 —
// "서버가 유일한 진실", 판정은 전부 여기서 계산하고 클라이언트는 결과만 표시한다).

/** 활성 참여자 중 한 명을 무작위로 라이어로 뽑는다. */
export function pickLiar(activePool) {
  return activePool[Math.floor(Math.random() * activePool.length)];
}

/** 발언 순서를 무작위로 섞는다 (Fisher–Yates). 첫 번째가 "임의로 정한 먼저 말할 사람". */
export function shuffleOrder(activePool) {
  const order = [...activePool];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** 한 카테고리의 단어 목록에서 서로 다른 두 단어를 뽑는다 (시민용/라이어용). */
export function pickWordPair(words) {
  const i = Math.floor(Math.random() * words.length);
  let j = Math.floor(Math.random() * (words.length - 1));
  if (j >= i) j += 1;
  return { citizenWord: words[i], liarWord: words[j] };
}

/**
 * 지목 투표를 집계한다.
 * @param {Map<number, number>} votes voterId -> accusedId
 * @returns {{ accusedId: number|null, tie: boolean, counts: Record<number, number> }}
 *   accusedId 는 최다 득표자. 동률이면 null + tie:true (동률은 라이어 승리로 처리한다는
 *   운영 결정에 따라 이 함수는 판정하지 않고 "동률이었다"는 사실만 알려준다).
 */
export function tallyVotes(votes) {
  const counts = new Map();
  for (const accusedId of votes.values()) {
    counts.set(accusedId, (counts.get(accusedId) ?? 0) + 1);
  }

  let topId = null;
  let topCount = -1;
  let tie = false;

  for (const [id, count] of counts) {
    if (count > topCount) {
      topId = id;
      topCount = count;
      tie = false;
    } else if (count === topCount) {
      tie = true;
    }
  }

  return {
    accusedId: tie || topId === null ? null : topId,
    tie: tie || topId === null,
    counts: Object.fromEntries(counts),
  };
}

/** 지목 결과와 실제 라이어를 비교해 승자를 정한다 (동률/무득표는 라이어 승). */
export function resolveWinner(accusedId, liarId) {
  return accusedId != null && accusedId === liarId ? 'citizen' : 'liar';
}
