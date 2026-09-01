// 의자 빨리 뺏기의 순수 로직 (DB·소켓 의존 없음 — mazeEngine.js 와 같은 방침).
//
// 현실 규칙을 그대로 옮긴다:
//  - 의자는 늘 "남은 인원 - 1"개. 매 라운드 한 자리가 모자란다.
//  - 원을 돌다가 멈추면 자기 근처 의자만 잡을 수 있다. 반대편으로 뛰어갈 수는 없다.
//    (의자가 1개뿐인 마지막 라운드만 예외 — 모두가 그 하나를 노린다.)
//
// 각도 계산은 서버와 클라이언트가 똑같이 해야 한다. 서버는 "이 사람이 이 의자를
// 잡을 자격이 있나"를 검사하고, 클라이언트는 "어떤 의자 버튼을 보여줄까"에 쓴다.
// 둘이 어긋나면 화면에 보이는 버튼을 눌렀는데 거부당하는 일이 생긴다.

export const NEARBY_CHAIRS = 2; // 양옆 하나씩 (운영 결정)
export const MIN_PARTICIPANTS = 2; // 혼자서는 게임이 안 된다
export const GRAB_WINDOW_MS = 6000; // 호루라기 뒤 앉을 수 있는 시간
export const SPIN_MIN_MS = 5000; // 호루라기가 울리기까지 (무작위)
export const SPIN_MAX_MS = 15000;
export const SPIN_DEG_PER_SEC = 60; // 닉네임이 도는 속도

/** 이번 라운드 의자 수 — 늘 한 자리가 모자라다. */
export function chairCountFor(playerCount) {
  return Math.max(1, playerCount - 1);
}

/** 호루라기가 울릴 때까지의 시간을 무작위로 정한다. */
export function pickSpinMs(random = Math.random) {
  return Math.round(SPIN_MIN_MS + random() * (SPIN_MAX_MS - SPIN_MIN_MS));
}

const norm = (deg) => ((deg % 360) + 360) % 360;

/** j번 의자가 놓인 각도. 의자는 원 위에 고르게 배치된다. */
export function chairAngle(index, chairCount) {
  return norm((index / chairCount) * 360);
}

/**
 * 멈춘 순간 이 참가자가 서 있는 각도.
 * 사람도 원 위에 고르게 서 있고, 원 전체가 freezeAngle 만큼 돌아가 있다.
 */
export function playerAngle(index, playerCount, freezeAngle) {
  return norm((index / playerCount) * 360 + freezeAngle);
}

/**
 * 이 각도에 서 있는 사람이 잡을 수 있는 의자들.
 *
 * 의자 사이 구간 어딘가에 서 있게 되므로, 그 구간의 양 끝 의자 두 개가 답이다.
 * 의자가 하나뿐이면 모두가 그 하나를 잡을 수 있다(운영 결정).
 *
 * @returns {number[]} 의자 번호 (오름차순, 중복 없음)
 */
export function allowedChairs(angle, chairCount) {
  if (chairCount <= 1) return [0];

  const step = 360 / chairCount;
  const lower = Math.floor(norm(angle) / step) % chairCount;
  const upper = (lower + 1) % chairCount;
  return lower === upper ? [lower] : [lower, upper].sort((a, b) => a - b);
}

/** 이 참가자가 이 의자를 잡을 자격이 있는지 (서버가 매 요청마다 확인한다). */
export function canTake(playerIndex, playerCount, freezeAngle, chairCount, chairIndex) {
  if (!Number.isInteger(chairIndex) || chairIndex < 0 || chairIndex >= chairCount) return false;
  const angle = playerAngle(playerIndex, playerCount, freezeAngle);
  return allowedChairs(angle, chairCount).includes(chairIndex);
}

/**
 * 라운드 결과를 낸다.
 *
 * @param {number[]} pool 이번 라운드 참가자
 * @param {Map<number, number>} seatOf participantId -> 앉은 의자 번호
 * @returns {{outcome:'ended'|'continue'|'wipeout', survivors:number[], eliminated:number[]}}
 */
export function resolveRound(pool, seatOf) {
  const survivors = pool.filter((id) => seatOf.has(id));
  const eliminated = pool.filter((id) => !seatOf.has(id));

  // 아무도 못 앉았으면(전원 가만히 있었다) 탈락시키지 않고 다시 한다
  if (survivors.length === 0) return { outcome: 'wipeout', survivors: [], eliminated: [] };
  if (survivors.length <= 1) return { outcome: 'ended', survivors, eliminated };
  return { outcome: 'continue', survivors, eliminated };
}
