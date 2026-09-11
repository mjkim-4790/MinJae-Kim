// '실루엣 통과' 화면이 쓰는 값. server/src/game/silhouetteEngine.js 와 맞춰야 한다.
//
// 화면이 하는 일은 둘뿐이다: 따라 할 모양을 그리는 것, 그리고 카메라가 잡은 관절에서
// **각도 8개만** 뽑아 보내는 것. 관절 좌표조차 서버로 보내지 않는다 — 각도만으로
// 채점이 되는데 굳이 몸의 위치를 넘길 이유가 없다.

export const LM = {
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

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

// 이 점수 아래로 잡힌 관절은 안 보이는 것으로 친다. 몸이 화면 밖으로 나가면
// MediaPipe 가 위치를 지어내는데, 그걸 믿으면 프레임 밖의 팔이 정답이 돼버린다.
const MIN_VISIBILITY = 0.5;

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

/** MediaPipe 33점 → 우리가 쓰는 관절 좌표 (안 보이는 점은 뺀다). */
export function pointsFromLandmarks(landmarks) {
  if (!landmarks) return null;
  const pts = {};
  for (const [name, idx] of Object.entries(LM)) {
    const p = landmarks[idx];
    if (!p) continue;
    const vis = p.visibility ?? 1;
    if (vis < MIN_VISIBILITY) continue;
    pts[name] = { x: p.x, y: p.y };
  }
  return pts;
}

/** 관절 좌표 → 각도 8개 (JOINTS 순서). 서버로 보내는 건 이것뿐이다. */
export function anglesFrom(pts) {
  if (!pts) return null;
  return JOINTS.map((j) => angleAt(pts[j.from], pts[j.at], pts[j.to]));
}

/** 전신이 잡혔는가 — 안 잡혔으면 "뒤로 물러나세요"를 띄운다. */
export function fullBodyVisible(pts) {
  if (!pts) return false;
  return ['shoulderL', 'shoulderR', 'hipL', 'hipR', 'kneeL', 'kneeR'].every((k) => pts[k]);
}

// 실루엣과 참가자 뼈대를 그릴 때 잇는 선
export const BONES = [
  ['shoulderL', 'shoulderR'], ['shoulderL', 'hipL'], ['shoulderR', 'hipR'], ['hipL', 'hipR'],
  ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
  ['hipL', 'kneeL'], ['kneeL', 'ankleL'],
  ['hipR', 'kneeR'], ['kneeR', 'ankleR'],
];

// 각도는 초당 몇 번만 보낸다. 30fps 로 전부 쏘면 초당 30건이 되는데, 판정에
// 필요한 해상도는 그보다 훨씬 낮다 (0.5초 유지가 기준이라).
export const SEND_MS = 100;
