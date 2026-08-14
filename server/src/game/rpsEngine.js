// 가위바위보 서바이벌 토너먼트 판정 로직 (설계문서 §6). 소켓/DB 와 무관한 순수 함수만 둔다.
// "서버가 유일한 진실" (§7-4) — 판정은 전부 여기서 계산하고 클라이언트는 결과만 표시한다.

export const CHOICES = ['rock', 'paper', 'scissors'];

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/** participantChoice 가 operatorChoice 를 이기면 true (§6.1 — MC를 이긴 사람만 생존) */
export function beatsOperator(participantChoice, operatorChoice) {
  return BEATS[participantChoice] === operatorChoice;
}

/**
 * 한 라운드 판정. 선택하지 않은 참여자(무응답)는 자동으로 비승자 처리한다.
 * @param {number[]} activePool 이번 라운드에 참여 가능한 participant id 목록
 * @param {Map<number, string>} choices participantId -> 'rock'|'paper'|'scissors'
 * @param {string} operatorChoice
 * @returns {{ winnerIds: number[], nonWinnerIds: number[] }}
 */
export function judgeRound(activePool, choices, operatorChoice) {
  const winnerIds = [];
  const nonWinnerIds = [];

  for (const id of activePool) {
    const choice = choices.get(id);
    if (choice && beatsOperator(choice, operatorChoice)) {
      winnerIds.push(id);
    } else {
      nonWinnerIds.push(id);
    }
  }

  return { winnerIds, nonWinnerIds };
}

/**
 * 라운드 결과를 목표 승자 수와 비교해 다음 상태를 결정한다 (§6.2 판정 분기).
 *
 * @param {object} params
 * @param {number[]} params.confirmedWinnerIds 이전 라운드까지 이미 확정된 승자
 * @param {number[]} params.winnerIds 이번 라운드 승자
 * @param {number[]} params.nonWinnerIds 이번 라운드 비승자 (탈락 후보)
 * @param {number[]} params.activePool 이번 라운드 전체 참여자
 * @param {number} params.target 목표 승자 수
 * @returns {
 *   | { outcome: 'ended', finalWinnerIds: number[], eliminatedIds: number[] }
 *   | { outcome: 'overshoot', nextActivePool: number[], nextConfirmedWinnerIds: number[], eliminatedIds: number[] }
 *   | { outcome: 'wipeout', nextActivePool: number[], nextConfirmedWinnerIds: number[], eliminatedIds: number[] }
 *   | { outcome: 'partial', nextActivePool: number[], nextConfirmedWinnerIds: number[], eliminatedIds: number[] }
 * }
 */
export function resolveBranch({ confirmedWinnerIds, winnerIds, nonWinnerIds, activePool, target }) {
  const totalSurvivors = confirmedWinnerIds.length + winnerIds.length;

  if (totalSurvivors > target) {
    // 생존자 > 목표 → 확정자+이번 승자를 합쳐 다시 좁혀나간다. 이번 라운드 비승자는 이 시점에 확정 탈락.
    return {
      outcome: 'overshoot',
      nextActivePool: [...confirmedWinnerIds, ...winnerIds],
      nextConfirmedWinnerIds: [],
      eliminatedIds: nonWinnerIds,
    };
  }

  if (totalSurvivors === target) {
    // 생존자 = 목표 → 종료. 이번 라운드 비승자도 최종 탈락.
    return {
      outcome: 'ended',
      finalWinnerIds: [...confirmedWinnerIds, ...winnerIds],
      eliminatedIds: nonWinnerIds,
    };
  }

  if (winnerIds.length === 0) {
    // 전멸 → 같은 인원으로 무효 재대결. 아무도 탈락하지 않는다.
    return {
      outcome: 'wipeout',
      nextActivePool: activePool,
      nextConfirmedWinnerIds: confirmedWinnerIds,
      eliminatedIds: [],
    };
  }

  // 확정자+생존자 < 목표 → 이번 승자는 확정 진출, 비승자는 패자부활전으로.
  return {
    outcome: 'partial',
    nextActivePool: nonWinnerIds,
    nextConfirmedWinnerIds: [...confirmedWinnerIds, ...winnerIds],
    eliminatedIds: [],
  };
}
