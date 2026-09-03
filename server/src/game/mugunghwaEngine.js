// '무궁화꽃이 피었습니다'의 순수 로직 (DB·소켓 의존 없음 — mazeEngine.js 와 같은 방침).
//
// 전통 놀이 그대로 두 단계다:
//  1) 접근 — 출발선에서 영희 쪽으로 간다. 영희가 등을 돌린 동안만 움직일 수 있고,
//     돌아봤을 때 움직이면 탈락. 여기서는 폰을 실제로 흔들어야 전진한다.
//  2) 탈출 — 누군가 영희를 터치하면 전원이 몸을 돌려 출발선으로 되돌아간다.
//     이때는 화면을 연타해서 달린다. 제한시간 안에 못 들어오면 탈락.
//
// 되돌아가는 구조라 1단계에서 적게 나아간 사람이 출발선에 가까워 유리하다.
// 전통 놀이도 마찬가지인데, 원래는 '영희를 터치하는 것' 자체가 목표라 균형이 맞는다.
// 그래서 터치한 사람에게 보너스를 준다 — 위험을 무릅쓴 대가다.

/** 위치는 0(출발선) ~ 1(영희)로 잰다. 화면 크기와 무관하게 같은 값을 쓰려는 것. */
export const START_POS = 0;
export const DOLL_POS = 1;
export const TOUCH_REACH = 0.985; // 이보다 가까우면 영희를 터치한 것으로 본다

// 흔들림 판정 강도 (운영 결정: 진행자가 고른다).
// 사람 손은 완벽히 멈추지 않아서 기준이 필요하다. 값은 가속도 크기(m/s²)에서
// 중력을 뺀 변화량 기준이며, 실제 기기에서 재본 손떨림(0.2~0.5)보다 위에 둔다.
export const STRICTNESS = [
  { id: 'loose', name: '느슨', desc: '웬만큼 흔들려도 봐준다', moveThreshold: 2.2 },
  { id: 'normal', name: '보통', desc: '일부러 움직이면 잡힌다', moveThreshold: 1.2 },
  { id: 'strict', name: '엄격', desc: '살짝만 움직여도 탈락', moveThreshold: 0.7 },
];

// 혼자서도 굴려볼 수 있게 1명부터 시작된다 (진행자가 리허설하거나 직접 해볼 때).
// 단, '참가자 중 영희 뽑기'는 영희가 주자에서 빠지므로 2명이 필요하다 —
// 그 검사는 realtime/mugunghwa.js 가 따로 한다.
export const MIN_PARTICIPANTS = 1;
export const FREEZE_GRACE_MS = 500; // 빨간불이 된 뒤 멈출 시간을 준다 (반응 시간 + 통신 지연)
export const SPRINT_MS = 10000; // 2단계 제한시간
export const APPROACH_SPEED = 0.1; // 최대로 흔들 때 초당 나아가는 거리
export const TAP_GAIN = 0.02; // 2단계에서 한 번 두드릴 때 나아가는 거리

// 점수
const WIN_POINTS = 150; // 최후의 1인
const SURVIVE_POINTS = 20; // 라운드를 넘길 때마다
const TOUCH_BONUS = 50; // 영희를 터치한 사람

export function strictnessById(id) {
  return STRICTNESS.find((s) => s.id === id) ?? null;
}

/** 흔들기 세기(0~1)를 이번 프레임의 이동 거리로 바꾼다. */
export function approachStep(intensity, dtSec) {
  const clamped = Math.min(1, Math.max(0, Number(intensity) || 0));
  return clamped * APPROACH_SPEED * dtSec;
}

/** 두드린 횟수를 되돌아가는 거리로 바꾼다. */
export function sprintStep(taps) {
  const n = Math.floor(Number(taps) || 0);
  return Math.max(0, n) * TAP_GAIN;
}

/** 위치를 0~1 밖으로 못 나가게 자른다. */
export function clampPos(pos) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return START_POS;
  return Math.min(DOLL_POS, Math.max(START_POS, p));
}

export function reachedDoll(pos) {
  return clampPos(pos) >= TOUCH_REACH;
}

export function reachedHome(pos) {
  return clampPos(pos) <= 0.015;
}

/**
 * 빨간불에 움직였는지 판정한다.
 * 빨간불이 된 직후 잠깐은 봐준다 — 사람이 반응하는 데 시간이 걸리고, 화면이
 * 바뀐 걸 알기까지 통신 지연도 있다. 그 사이를 잡으면 억울한 탈락만 나온다.
 */
export function movedOnRed(shake, threshold, redSince, now) {
  if (redSince == null) return false;
  if (now - redSince < FREEZE_GRACE_MS) return false;
  return Number(shake) > threshold;
}

/**
 * 라운드 결과.
 * @param {number[]} pool 이번 라운드 참가자 (영희는 빠져 있다)
 * @param {Set<number>} caught 빨간불에 움직여 잡힌 사람
 * @param {Set<number>} home 출발선으로 돌아온 사람
 */
export function resolveRound(pool, caught, home) {
  const survivors = pool.filter((id) => !caught.has(id) && home.has(id));
  const eliminated = pool.filter((id) => !survivors.includes(id));

  // 아무도 못 돌아왔으면 판을 무효로 한다 (통신 문제로 한 판이 통째로 날아가는 걸 막는다)
  if (survivors.length === 0) return { outcome: 'wipeout', survivors: [], eliminated: [] };
  if (survivors.length <= 1) return { outcome: 'ended', survivors, eliminated };
  return { outcome: 'continue', survivors, eliminated };
}

export function pointsFor({ outcome, survived, touchedDoll }) {
  let points = 0;
  if (survived) points += outcome === 'ended' ? WIN_POINTS : SURVIVE_POINTS;
  if (touchedDoll) points += TOUCH_BONUS;
  return points;
}

/** 참가자 중 한 명을 영희로 뽑는다. */
export function pickDoll(pool, random = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)];
}
