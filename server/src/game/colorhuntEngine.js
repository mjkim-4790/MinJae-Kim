// '색깔 사냥'의 순수 로직 (DB·소켓 의존 없음 — mazeEngine.js 와 같은 방침).
//
// ── 이 게임에서 서버가 하는 일 ──────────────────────────────────────────────
// 참여자 폰이 카메라 프레임에서 대표색 하나를 뽑아 hex 로 보낸다. 사진은 절대
// 서버로 오지 않는다. 그래도 "통과했는가"는 **서버가 그 hex 로 다시 계산한다** —
// 폰이 보낸 통과 여부는 받지도 믿지도 않는다. 설계문서 §7-4("서버가 유일한
// 진실")를 이미지를 받지 않고 지키는 방법이다.
//
// ── 왜 색 '거리'가 아니라 색 '각도'인가 ─────────────────────────────────────
// 이 게임이 묻는 건 "이 견본과 몇 점이나 가까운가"가 아니라 "주황색인가"다.
// 거리로 재면 그늘진 주황과 햇빛 받은 주황이 서로 멀어져서, 실력이 아니라
// 조명이 승부를 가른다. OKLCh 의 색상각(H)으로 판정하고 밝기(L)는 넓게 열어두면
// 같은 물체가 어디서 찍히든 같은 판정을 받는다.

import { hexToOklch, hueDistance } from './color.js';

export { hexToOklch, hueDistance };

/**
 * 출제 색 팔레트.
 *
 * 숫자는 추측이 아니라 실제 색 견본 40여 개를 OKLCh 로 변환해 뽑은 범위다.
 * 그 과정에서 나온 두 가지가 설계를 바꿨다:
 *
 *  1) 갈색과 주황은 **색상각이 거의 같다** (둘 다 40~70도). 사람이 둘을 가르는 건
 *     색상이 아니라 채도다 — 갈색은 탁한 주황이다. 그래서 갈색에만 채도 상한을
 *     두고 주황에는 하한을 둬서 0.13 을 경계로 갈라놓았다.
 *  2) 분홍은 **0도를 넘나든다** (357도와 7도가 같은 무리). 원형 거리를 안 쓰면
 *     여기서 판정이 통째로 뒤집힌다.
 *
 * halfDeg 는 색마다 다르다. '파랑'은 청록부터 남색까지 사람들이 다 파랑이라고
 * 부르지만 '노랑'은 그 폭이 훨씬 좁다. 하나의 각도로 묶으면 노랑이 너무 헐거워지거나
 * 파랑이 너무 빡빡해진다.
 */
export const PALETTE = [
  { id: 'red',    name: '빨강', swatch: '#e01b1b', hue: 25,  halfDeg: 20, lRange: [0.30, 0.80], cMin: 0.08 },
  { id: 'orange', name: '주황', swatch: '#ff8c00', hue: 58,  halfDeg: 18, lRange: [0.55, 0.92], cMin: 0.13 },
  { id: 'yellow', name: '노랑', swatch: '#ffd700', hue: 98,  halfDeg: 18, lRange: [0.75, 1.00], cMin: 0.10 },
  { id: 'green',  name: '초록', swatch: '#2e9e4f', hue: 148, halfDeg: 30, lRange: [0.30, 0.90], cMin: 0.07 },
  { id: 'blue',   name: '파랑', swatch: '#1e78e0', hue: 245, halfDeg: 35, lRange: [0.25, 0.90], cMin: 0.07 },
  { id: 'purple', name: '보라', swatch: '#8e3fc0', hue: 310, halfDeg: 25, lRange: [0.30, 0.85], cMin: 0.07 },
  { id: 'pink',   name: '분홍', swatch: '#ff69b4', hue: 355, halfDeg: 20, lRange: [0.60, 0.95], cMin: 0.06 },
  // 갈색만 채도 상한이 있다 — 이게 없으면 선명한 주황이 전부 갈색으로도 통과한다
  { id: 'brown',  name: '갈색', swatch: '#8b5a2b', hue: 55,  halfDeg: 30, lRange: [0.22, 0.75], cMin: 0.025, cMax: 0.13 },

  // 무채색은 색상각이 없다. 채도가 낮다는 것 + 밝기만으로 판정한다.
  { id: 'white',  name: '흰색', swatch: '#f5f5f5', achromatic: true, lRange: [0.80, 1.00], cMax: 0.04 },
  { id: 'gray',   name: '회색', swatch: '#9e9e9e', achromatic: true, lRange: [0.35, 0.78], cMax: 0.04 },
  { id: 'black',  name: '검정', swatch: '#1a1a1a', achromatic: true, lRange: [0.00, 0.28], cMax: 0.05 },
];

export function colorById(id) {
  return PALETTE.find((c) => c.id === id) ?? null;
}

// 난이도는 각도를 직접 더하고 빼는 대신 **배율**로 조절한다. 색마다 기본 폭이
// 다르기 때문에(위 주석), 같은 3도를 더해도 노랑에는 크고 파랑에는 작다.
// 배율이면 모든 색이 같은 비율로 헐거워지고 빡빡해진다.
export const TOLERANCE_MIN = 0.7;
export const TOLERANCE_MAX = 1.4;
export const TOLERANCE_DEFAULT = 1.0;

export function clampTolerance(scale) {
  const v = Number(scale);
  if (!Number.isFinite(v)) return TOLERANCE_DEFAULT;
  return Math.min(TOLERANCE_MAX, Math.max(TOLERANCE_MIN, v));
}

/**
 * 이 hex 가 출제 색에 해당하는가.
 *
 * @param {string} hex 폰이 뽑아 보낸 대표색
 * @param {object} target PALETTE 항목
 * @param {number} scale 난이도 배율 (작을수록 엄격)
 * @returns {{ pass: boolean, reason: string, lch: {L,C,H}|null }}
 *          reason 은 진행자 화면과 로그용이다. 참여자에게는 통과/실패만 보여준다 —
 *          "채도가 0.06 이라 탈락"은 게임이 아니라 계측기다.
 */
export function judge(hex, target, scale = TOLERANCE_DEFAULT) {
  const lch = hexToOklch(hex);
  if (!lch) return { pass: false, reason: 'BAD_HEX', lch: null };
  if (!target) return { pass: false, reason: 'NO_TARGET', lch };

  const k = clampTolerance(scale);
  const { L, C, H } = lch;

  // 밝기 창은 난이도에 따라 위아래로 함께 넓어진다
  const [lo, hi] = target.lRange;
  const pad = ((hi - lo) * (k - 1)) / 2;
  if (L < lo - pad || L > hi + pad) return { pass: false, reason: 'LIGHTNESS', lch };

  if (target.achromatic) {
    // 무채색 — 색이 돌면 탈락. 카메라 노이즈로 C 가 0.01 쯤 뜨는 건 정상이라 그 위에 선을 둔다.
    return C <= target.cMax * k
      ? { pass: true, reason: 'OK', lch }
      : { pass: false, reason: 'TOO_COLORFUL', lch };
  }

  if (C < target.cMin / k) return { pass: false, reason: 'TOO_DULL', lch };
  if (target.cMax != null && C > target.cMax * k) return { pass: false, reason: 'TOO_VIVID', lch };
  if (hueDistance(H, target.hue) > target.halfDeg * k) return { pass: false, reason: 'HUE', lch };

  return { pass: true, reason: 'OK', lch };
}

// 점수 — 차감 없이 가점만 (운영 결정). 빨리 맞힐수록 많이 받되, 여러 번 시도한
// 사람도 0 점은 아니다. 탈락이 없는 게임에서 0 점은 사실상 탈락이라서다.
const ATTEMPT_POINTS = [100, 70, 50];
const MIN_POINTS = 30;

/** 몇 번째 시도에 통과했는지로 점수를 매긴다 (1부터 셈). */
export function pointsFor(attempt) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  return ATTEMPT_POINTS[n - 1] ?? MIN_POINTS;
}

/**
 * 첫 시도 실패율.
 *
 * 최종 실패율로 재면 안 된다 — 통과할 때까지 다시 찍을 수 있으니 결국 0 에 수렴해서
 * 난이도 신호가 되지 못한다. "처음 찍었을 때 맞았는가"만이 난이도를 말해준다.
 *
 * @param {{firstPass: boolean}[]} rows 이번 라운드에 한 번이라도 제출한 사람들
 */
export function firstAttemptFailRate(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null; // 표본 없음 — 난이도를 건드리지 않는다
  const failed = list.filter((r) => !r.firstPass).length;
  return failed / list.length;
}

/** 진행자가 무작위 출제를 고를 때. 직전 색은 피한다 — 같은 색이 연달아 나오면 김샌다. */
export function pickColor(excludeId = null, random = Math.random) {
  const pool = PALETTE.filter((c) => c.id !== excludeId);
  return pool[Math.floor(random() * pool.length)];
}
