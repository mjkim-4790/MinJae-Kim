// '실루엣 통과'의 순수 로직 (DB·소켓 의존 없음).
//
// 화면에 사람 모양이 뜨고, 제한시간 안에 몸을 그 모양으로 만들면 통과다.
//
// ── 왜 위치가 아니라 각도로 재는가 ─────────────────────────────────────────
// 관절의 화면 좌표를 그대로 비교하면 키가 크거나 카메라에서 멀면 전부 틀린 게 된다.
// 사람이 실제로 맞추는 건 '모양'이지 '좌표'가 아니다. 그래서 팔꿈치·어깨·엉덩이·
// 무릎이 벌어진 각도만 본다 — 키와 거리에 영향받지 않는다.
//
// ── 포즈를 좌표로 적고 각도는 뽑아 쓴다 ────────────────────────────────────
// 목표 각도를 손으로 적어두면 화면에 그리는 그림과 조금씩 어긋난다 (직접 겪을 일이다).
// 그래서 포즈는 스틱피겨 좌표 하나로만 적고, 목표 각도는 그 좌표에서 계산한다.
// 보여주는 모양과 채점하는 기준이 같은 출처에서 나온다.

// MediaPipe Pose 33점 중 우리가 쓰는 것
export const LM = {
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

// 재는 각도 8개 — 세 점이 이루는 사이각
export const JOINTS = [
  { id: 'elbowL', at: 'elbowL', from: 'shoulderL', to: 'wristL' },
  { id: 'elbowR', at: 'elbowR', from: 'shoulderR', to: 'wristR' },
  { id: 'shoulderL', at: 'shoulderL', from: 'elbowL', to: 'hipL' },
  { id: 'shoulderR', at: 'shoulderR', from: 'elbowR', to: 'hipR' },
  { id: 'hipL', at: 'hipL', from: 'shoulderL', to: 'kneeL' },
  { id: 'hipR', at: 'hipR', from: 'shoulderR', to: 'kneeR' },
  { id: 'kneeL', at: 'kneeL', from: 'hipL', to: 'ankleL' },
  { id: 'kneeR', at: 'kneeR', from: 'hipR', to: 'ankleR' },
];

/** 세 점 a-b-c 에서 b 의 사이각(도). 점이 없으면 null. */
export function angleAt(a, b, c) {
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 관절 좌표 묶음에서 각도 8개를 뽑는다.
 * @param {Record<string,{x:number,y:number}>} pts LM 키로 접근 가능한 점들
 * @returns {(number|null)[]} JOINTS 순서
 */
export function anglesFrom(pts) {
  return JOINTS.map((j) => angleAt(pts[j.from], pts[j.at], pts[j.to]));
}

// 포즈 정의 — 정면에서 본 스틱피겨 좌표 (0~1, 화면 비율과 무관한 상대값).
// 좌/우는 '보는 사람 기준'이 아니라 '그 사람의 왼쪽/오른쪽'이다 (MediaPipe 규격).
//
// weights 는 그 포즈에서 무엇이 중요한지다. 만세는 다리가 어떻든 상관없고,
// 별 모양은 다리까지 봐야 한다. 0 은 아예 안 보는 관절.
const P = (x, y) => ({ x, y });

export const POSES = [
  {
    id: 'tpose',
    name: 'T자',
    hint: '양팔을 옆으로 쭉',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.26, 0.32), elbowR: P(0.74, 0.32),
      wristL: P(0.10, 0.32), wristR: P(0.90, 0.32),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.44, 0.76), kneeR: P(0.56, 0.76),
      ankleL: P(0.43, 0.94), ankleR: P(0.57, 0.94),
    },
    weights: { elbowL: 1, elbowR: 1, shoulderL: 1.4, shoulderR: 1.4, hipL: 0.4, hipR: 0.4, kneeL: 0.3, kneeR: 0.3 },
  },
  {
    id: 'banzai',
    name: '만세',
    hint: '양팔을 머리 위로',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.36, 0.18), elbowR: P(0.64, 0.18),
      wristL: P(0.32, 0.04), wristR: P(0.68, 0.04),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.44, 0.76), kneeR: P(0.56, 0.76),
      ankleL: P(0.43, 0.94), ankleR: P(0.57, 0.94),
    },
    weights: { elbowL: 1, elbowR: 1, shoulderL: 1.4, shoulderR: 1.4, hipL: 0.4, hipR: 0.4, kneeL: 0.3, kneeR: 0.3 },
  },
  {
    id: 'oneup',
    name: '한 팔 들기',
    hint: '오른팔만 위로, 왼팔은 내리고',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.40, 0.46), elbowR: P(0.64, 0.18),
      wristL: P(0.39, 0.60), wristR: P(0.68, 0.04),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.44, 0.76), kneeR: P(0.56, 0.76),
      ankleL: P(0.43, 0.94), ankleR: P(0.57, 0.94),
    },
    weights: { elbowL: 0.8, elbowR: 1, shoulderL: 1.5, shoulderR: 1.5, hipL: 0.3, hipR: 0.3, kneeL: 0.2, kneeR: 0.2 },
  },
  {
    id: 'flex',
    name: '알통 자랑',
    hint: '양팔을 90도로 굽혀 위로',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.24, 0.34), elbowR: P(0.76, 0.34),
      wristL: P(0.28, 0.16), wristR: P(0.72, 0.16),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.44, 0.76), kneeR: P(0.56, 0.76),
      ankleL: P(0.43, 0.94), ankleR: P(0.57, 0.94),
    },
    weights: { elbowL: 1.5, elbowR: 1.5, shoulderL: 1, shoulderR: 1, hipL: 0.3, hipR: 0.3, kneeL: 0.2, kneeR: 0.2 },
  },
  {
    id: 'teapot',
    name: '주전자',
    hint: '한 손은 허리, 한 손은 위로',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.28, 0.44), elbowR: P(0.66, 0.20),
      wristL: P(0.44, 0.56), wristR: P(0.70, 0.05),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.44, 0.76), kneeR: P(0.56, 0.76),
      ankleL: P(0.43, 0.94), ankleR: P(0.57, 0.94),
    },
    weights: { elbowL: 1.4, elbowR: 1, shoulderL: 1.2, shoulderR: 1.2, hipL: 0.3, hipR: 0.3, kneeL: 0.2, kneeR: 0.2 },
  },
  {
    id: 'star',
    name: '별',
    hint: '팔도 다리도 활짝',
    points: {
      shoulderL: P(0.42, 0.32), shoulderR: P(0.58, 0.32),
      elbowL: P(0.28, 0.22), elbowR: P(0.72, 0.22),
      wristL: P(0.14, 0.12), wristR: P(0.86, 0.12),
      hipL: P(0.45, 0.58), hipR: P(0.55, 0.58),
      kneeL: P(0.36, 0.76), kneeR: P(0.64, 0.76),
      ankleL: P(0.26, 0.94), ankleR: P(0.74, 0.94),
    },
    weights: { elbowL: 1, elbowR: 1, shoulderL: 1.2, shoulderR: 1.2, hipL: 1, hipR: 1, kneeL: 0.6, kneeR: 0.6 },
  },
];

// 목표 각도는 위 좌표에서 뽑는다 (손으로 적지 않는다)
for (const pose of POSES) {
  pose.targetAngles = anglesFrom(pose.points);
}

export function poseById(id) {
  return POSES.find((p) => p.id === id) ?? null;
}

// 이 각도만큼 틀리면 그 관절 점수는 0 이 된다. 사람이 눈으로 "비슷하다"고 보는
// 범위가 대략 이 정도다 — 너무 좁게 잡으면 정확히 맞춰도 통과가 안 된다.
// 45 도로 뒀더니 자세를 맞춰도 몸이 조금만 흔들리면 떨어졌다. 60 이 '정확히 하면
// 늘 통과, 엉성하면 자주 실패'가 되는 지점이었다.
export const ANGLE_TOLERANCE = 60;

// 이 무게 이상인 관절은 '그 포즈를 그 포즈이게 하는' 관절이다. 하나라도 완전히
// 틀리면 다른 포즈다.
const KEY_WEIGHT = 1;
// 핵심 관절 하나가 틀렸을 때 평균이 덮어줄 수 있는 한도.
const WORST_MARGIN = 0.3;

/**
 * 목표 포즈와 얼마나 닮았는가 (0~1).
 *
 * 단순 평균으로 재면 안 된다. '만세'와 '한 팔 들기'는 왼쪽 어깨 하나만 다른데,
 * 나머지 일곱 관절이 같으니 평균이 0.76 까지 올라가 서로 통과해버렸다
 * (실제로 그렇게 나왔다). 팔꿈치 각도는 팔을 위로 뻗든 아래로 내리든 똑같이
 * 180도라서, 그 차이를 어깨 하나가 혼자 짊어지기 때문이다.
 *
 * 그래서 평균에 더해 **가장 못 맞춘 핵심 관절**로 상한을 씌운다. 중요한 관절이
 * 하나라도 크게 틀리면 나머지가 아무리 맞아도 점수가 오르지 않는다.
 *
 * @param {(number|null)[]} angles 참가자의 관절 각도 (JOINTS 순서)
 * @param {object} pose POSES 항목
 * @returns {{ match: number, mean: number, worst: number, per: Record<string, number> } | null}
 */
export function matchScore(angles, pose) {
  if (!Array.isArray(angles) || !pose) return null;
  let sum = 0;
  let weightSum = 0;
  let worst = 1;
  const per = {};

  JOINTS.forEach((j, i) => {
    const w = pose.weights[j.id] ?? 0;
    if (w <= 0) return;
    const got = angles[i];
    const want = pose.targetAngles[i];
    // 못 잡은 관절은 0 점 처리한다. 빼고 평균 내면 몸을 반쯤 가려서 점수를 올릴 수 있다.
    const s = got == null || want == null ? 0 : Math.max(0, 1 - Math.abs(got - want) / ANGLE_TOLERANCE);
    per[j.id] = s;
    sum += s * w;
    weightSum += w;
    if (w >= KEY_WEIGHT && s < worst) worst = s;
  });

  if (weightSum === 0) return null;
  const mean = sum / weightSum;
  return { match: Math.min(mean, worst + WORST_MARGIN), mean, worst, per };
}

// 통과 기준. 난이도 자동 조절이 이 값을 위아래로 움직인다 (adaptive.js).
// 값이 커질수록 어렵다.
//
// 하한이 중요하다. 다른 포즈를 취했을 때 나오는 최고 점수(maxCrossPoseMatch, 약 0.70)
// 보다 낮게 내려가면 **엉뚱한 자세가 통과**한다 — 난이도를 낮췄더니 게임이 사라지는
// 일이 생긴다. 그래서 하한을 그 위에 둔다.
export const THRESHOLD_MIN = 0.72;
export const THRESHOLD_MAX = 0.9;
export const THRESHOLD_DEFAULT = 0.78;
export const THRESHOLD_STEP = 0.03;

/**
 * 서로 다른 포즈끼리 나올 수 있는 최고 점수.
 *
 * THRESHOLD_MIN 이 이 값보다 높은지 확인하는 데 쓴다. 포즈를 새로 추가할 때
 * 이 값이 올라가면 하한도 같이 올려야 한다 — 안 그러면 그 포즈로 다른 포즈를
 * 통과할 수 있다.
 */
export function maxCrossPoseMatch() {
  let worst = 0;
  for (const a of POSES) {
    for (const b of POSES) {
      if (a.id === b.id) continue;
      const m = matchScore(anglesFrom(a.points), b);
      if (m && m.match > worst) worst = m.match;
    }
  }
  return worst;
}

export function clampThreshold(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return THRESHOLD_DEFAULT;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n));
}

// ── 두 가지 방식 ──────────────────────────────────────────────────────────
// single : 자세 하나를 골라 제한시간 안에 맞춘다 (연습용)
// wall   : 사람 모양으로 뚫린 벽이 다가온다. 닿는 순간의 자세로 판정하고,
//          40초 동안 몇 장을 통과했는지로 점수를 낸다 (본 게임)
export const MODES = [
  { id: 'single', name: '자세 연습', desc: '고른 자세 하나를 제한시간 안에' },
  { id: 'wall', name: '벽 넘기', desc: '40초 동안 다가오는 벽을 최대한 많이' },
];

export function modeById(id) {
  return MODES.find((m) => m.id === id) ?? null;
}

// 한 판 길이 (운영 결정: 3~10초).
// 팔을 오래 들고 있게 만들지 않는다 — 자세를 맞추는 순간 바로 끝난다.
export const ROUND_MS = 8000;

// ── 벽 넘기 ────────────────────────────────────────────────────────────────
export const WALL_SESSION_MS = 40000; // 한 사람에게 주어지는 전체 시간
export const WALL_GAP_MS = 700; // 벽과 벽 사이 숨 돌리는 시간

// 벽은 올수록 빨라진다. 처음엔 여유롭게 지켜보다가 뒤로 갈수록 손이 급해진다.
const WALL_FIRST_MS = 6000;
const WALL_FASTER_PER_WALL = 450;
const WALL_FLOOR_MS = 2400; // 이보다 빠르면 사람이 반응할 수 없다

/** n 번째 벽이 다가오는 데 걸리는 시간 (0부터 셈). */
export function wallTravelMs(n) {
  const i = Math.max(0, Math.floor(Number(n) || 0));
  return Math.max(WALL_FLOOR_MS, WALL_FIRST_MS - i * WALL_FASTER_PER_WALL);
}

/**
 * 벽이 닿기 직전 이만큼의 구간에서 가장 잘 맞춘 순간으로 판정한다.
 *
 * 닿는 순간 딱 한 프레임만 보면 인식이 한 번 튀는 것만으로 억울하게 실패한다.
 * 그렇다고 처음부터 다 보면 "순간"의 맛이 사라진다. 마지막 1초가 그 사이다.
 */
export const WALL_JUDGE_MS = 1000;

// 점수 — 40초 안에 통과한 장수로만 매긴다 (운영 결정).
const POINTS_PER_WALL = 25;

export function wallPoints(passCount) {
  return Math.max(0, Math.floor(Number(passCount) || 0)) * POINTS_PER_WALL;
}
export const READY_MS = 2500; // 카메라 앞에 서서 전신이 잡힐 시간
// 이만큼 유지해야 인정한다. 팔을 흔들다 스쳐 지나간 순간을 통과로 쳐주면 안 된다.
export const HOLD_MS = 500;

// 점수 — 차감 없이 가점만.
const BASE_POINTS = 50;
const SPEED_BONUS = 30;
const MATCH_BONUS = 20; // 얼마나 정확했는지

export function pointsFor(passed, matchValue, elapsedMs) {
  if (!passed) return 0;
  const left = Math.max(0, Math.min(1, 1 - (Number(elapsedMs) || 0) / ROUND_MS));
  const quality = Math.max(0, Math.min(1, Number(matchValue) || 0));
  return BASE_POINTS + Math.round(SPEED_BONUS * left) + Math.round(MATCH_BONUS * quality);
}

/** 직전 포즈는 피해서 다음 포즈를 뽑는다. */
export function pickPose(excludeId = null, random = Math.random) {
  const pool = POSES.filter((p) => p.id !== excludeId);
  return pool[Math.floor(random() * pool.length)];
}
