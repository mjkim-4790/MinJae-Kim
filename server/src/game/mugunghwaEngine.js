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

// 도망 구간이 끝나면 영희가 **가장 늦게 들어온 한 명**을 잡는다 (운영 결정).
// 예전에는 영희를 사람이 조종해 쫓아다녔는데, 그러려면 누군가 영희를 맡아야 해서
// 한 명이 게임에서 빠졌다. 영희를 자동으로 돌리면 전원이 주자가 되고, 규칙도
// "꼴찌만 잡힌다" 한 줄로 끝나 설명이 짧아진다.
export const DOLL_POST = 1; // 영희는 제자리를 지킨다

// 혼자 남은 사람까지 잡으면 아무도 안 남아 판이 무효가 된다 (wipeout 무한반복).
// 두 명 이상일 때만 꼴찌를 잡는다.
export const MIN_RUNNERS_TO_CATCH = 2;

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

/**
 * 영희에게 잡힐 '꼴찌' 한 명을 고른다.
 *
 * 출발선에 들어온 사람은 들어온 시각 순, 못 들어온 사람은 그보다 뒤다
 * (못 들어온 사람끼리는 영희에게 가까이 남아 있을수록 뒤). 그중 가장 마지막 한 명.
 *
 * @param {number[]} pool 이번 라운드 주자 (빨간불에 잡힌 사람은 빼고 넘긴다)
 * @param {Map<number, number>} homeAt participantId -> 출발선 도착 시각
 * @param {Map<number, number>} positions participantId -> 마지막 위치 (0 출발선 ~ 1 영희)
 * @returns {number|null} 잡힐 사람. 잡을 필요가 없으면 null
 */
export function lastToArrive(pool, homeAt, positions) {
  if (!Array.isArray(pool) || pool.length < MIN_RUNNERS_TO_CATCH) return null;
  let worst = null;
  let worstKey = null;
  for (const id of pool) {
    const arrived = homeAt.get(id);
    // [못 들어왔는가, 늦은 정도] — 못 들어온 쪽이 언제나 뒤로 간다
    const key = arrived != null ? [0, arrived] : [1, clampPos(positions.get(id) ?? 1)];
    if (worstKey == null || key[0] > worstKey[0] || (key[0] === worstKey[0] && key[1] > worstKey[1])) {
      worst = id;
      worstKey = key;
    }
  }
  return worst;
}

// ── 구호 박자 ──────────────────────────────────────────────────────────────
// "무궁화 꽃이 피었습니다"를 늘 같은 속도로 읽으면 사람들이 박자를 외워버려서,
// 구호가 끝나기 직전에 딱 멈추는 게 쉬워진다. 매번 속도를 바꾸면 그게 안 된다.
//
// 시간을 먼저 뽑고 거기에 맞는 읽기 속도를 구한다 (그 반대가 아니다). 읽기 속도로
// 시간을 유추하면 기기마다 음성 엔진이 달라 빨간불과 말이 어긋나는데, 이렇게 하면
// 불이 바뀌는 시각은 서버가 쥐고 말은 거기에 맞춰 따라온다.
export const CHANT_MIN_MS = 1300;
export const CHANT_MAX_MS = 3300;
// 속도 1.0 으로 읽었을 때의 대략적인 길이. 정확할 필요는 없다 — 이 값은 '어느 정도
// 속도로 읽을지'를 정할 뿐이고, 불이 바뀌는 시점은 서버 타이머가 정한다.
const CHANT_BASE_MS = 2300;
export const RATE_MIN = 0.6;
export const RATE_MAX = 2;
// 영희가 돌아본 채로 노려보는 시간. 여기는 흔들지 않는다 — 멈춰 있는 시간까지
// 들쭉날쭉하면 억울한 탈락만 늘어난다.
export const RED_MS = 1700;

/** 이번 구호의 길이와 읽기 속도. */
export function rollChant(random = Math.random) {
  const ms = Math.round(CHANT_MIN_MS + random() * (CHANT_MAX_MS - CHANT_MIN_MS));
  const rate = Math.min(RATE_MAX, Math.max(RATE_MIN, CHANT_BASE_MS / ms));
  return { ms, rate: Math.round(rate * 100) / 100 };
}
