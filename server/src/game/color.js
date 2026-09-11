// sRGB ↔ OKLab ↔ OKLCh 변환 (순수 함수. 브라우저 API 에 의존하지 않는다).
//
// 왜 OKLab 인가:
// RGB 유클리드 거리는 사람 눈과 어긋난다 — 파랑 쪽은 숫자가 조금만 변해도 눈에 확
// 다르고, 초록 쪽은 많이 변해도 비슷해 보인다. CIELAB 이 그걸 고치지만 파랑 근처에서
// 색상(hue)이 휘는 문제가 남아 있다. OKLab 은 그 휘어짐까지 잡은 최신 색공간이고,
// 구현이 행렬 두 번과 세제곱근뿐이라 폰에서 픽셀 수천 개를 돌려도 부담이 없다.
//
// 이 게임이 실제로 묻는 건 "이 견본과 몇 점이나 가까운가"가 아니라 "주황색인가"다.
// 그래서 극좌표인 OKLCh(L 밝기, C 채도, H 색상각)로 바꿔 색상각으로 판정한다.
// 밝은 주황과 어두운 주황은 L 이 다를 뿐 H 는 같다.
//
// !! client/src/lib/color.js 와 글자 그대로 같은 파일이다. 한쪽만 고치면
//    폰이 뽑은 색과 서버가 판정하는 색이 어긋난다. 반드시 같이 고칠 것.
//    (두 파일이 같은 값을 내는지는 검증 스크립트로 확인한다 — 계획서 참조.)

/** sRGB 채널(0~1) → 선형 광량. 화면 감마를 되돌린다. */
function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 선형 광량 → sRGB 채널(0~1). */
function toGamma(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * sRGB(0~255) → OKLab.
 * 출처: Björn Ottosson, "A perceptual color space for image processing" (2020).
 */
export function rgbToOklab(r, g, b) {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → sRGB(0~255, 정수로 자름). 색역 밖 값은 0~255 로 잘린다. */
export function oklabToRgb(L, a, bb) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const clamp = (v) => Math.min(255, Math.max(0, Math.round(toGamma(v) * 255)));
  return { r: clamp(lr), g: clamp(lg), b: clamp(lb) };
}

/** OKLab → OKLCh. H 는 0~360 도. */
export function oklabToOklch({ L, a, b }) {
  const C = Math.hypot(a, b);
  // 무채색은 색상각이 의미가 없다. atan2(0,0)=0 이 "빨강"으로 읽히면 안 되므로 0 으로 두되
  // 판정에서는 C 하한으로 먼저 걸러낸다.
  let H = C < 1e-7 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function rgbToOklch(r, g, b) {
  return oklabToOklch(rgbToOklab(r, g, b));
}

export function oklchToRgb({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad));
}

/** "#rrggbb" → {r,g,b}. 잘못된 값이면 null. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const two = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  return `#${two(r)}${two(g)}${two(b)}`;
}

export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToOklch(rgb.r, rgb.g, rgb.b) : null;
}

export function oklchToHex(lch) {
  return rgbToHex(oklchToRgb(lch));
}

/**
 * 두 색상각 사이의 거리(도). 색상은 원형이라 350도와 10도는 340도가 아니라 20도 차이다.
 * 이걸 빼먹으면 빨강(≈29도) 근처에서 판정이 통째로 뒤집힌다.
 */
export function hueDistance(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}
