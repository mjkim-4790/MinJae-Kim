// 카메라 프레임에서 '이 물건의 색' 한 개를 뽑아낸다. 전부 폰 안에서 끝나고,
// 밖으로 나가는 건 hex 문자열 하나뿐이다. 사진은 어디에도 저장되지 않는다.
//
// ── 평균색을 쓰면 안 되는 이유 ─────────────────────────────────────────────
// 화면에 든 픽셀을 전부 평균 내면 언제나 탁한 회갈색이 나온다. 빨강과 초록을
// 섞으면 눈에는 둘 다 안 보이는 진흙색이 되기 때문이다. 그래서 "가장 많이 보이는
// 색 무리"를 먼저 고르고, 그 무리 안에서만 대표값을 낸다.

import { oklabToRgb, rgbToHex, rgbToOklab, oklabToOklch } from './color.js';

// 가운데만 본다. 물건을 화면 한가운데 대라고 안내하고, 실제로도 거기만 읽는다 —
// 배경(바닥·벽·손)이 섞이면 무슨 색을 찍었는지 알 수 없게 된다.
const CROP = 0.4;
// 이 크기로 줄여서 읽는다. 브라우저의 리샘플링이 노이즈를 눌러주고, 1024 픽셀이면
// 대표색을 정하기에 충분하다 (폰에서 1ms 도 안 걸린다).
const GRID = 32;

// 너무 어두운 픽셀은 색 정보가 없다.
const L_MIN = 0.12;
// 세 채널이 다 꼭대기에 붙은 픽셀도 정보가 없다 — 하얗게 날아가면 흰 종이인지
// 과다노출된 빨간 옷인지 구분할 수 없다.
//
// 밝기(L)로 자르면 안 된다. 그렇게 했더니 진짜 흰 벽(#f5f5f5, L=0.97)이 통째로
// 걸러져서 '흰색' 출제를 아무도 통과할 수 없었다. 날아간 것과 흰 것은 다르다.
const CLIP_CHANNEL = 254;
// 유효 픽셀이 이보다 적으면 판정하지 않는다 (안개)
const MIN_VALID_RATIO = 0.4;
// 이 채도 아래는 '색이 없다'고 본다. 카메라 노이즈로 0.01 쯤은 늘 뜬다.
const CHROMA_FLOOR = 0.04;
// 유채색 픽셀이 이 비율보다 적으면 무채색(흰/검/회)으로 본다
const CHROMATIC_RATIO = 0.25;

const BINS = 12; // 색상환을 30도씩
const BIN_DEG = 360 / BINS;
// 대표 무리에 포함할 색상 폭. 한 칸(30도)만 쓰면 355도와 5도처럼 칸 경계에 걸친
// 색이 반으로 쪼개져 엉뚱한 무리가 1등이 된다.
const GATHER_DEG = 45;

export const FOG = {
  DARK: '너무 어두워요. 조금 더 밝은 곳에서 찍어보세요',
  BLOWN: '빛이 너무 세요. 조명을 등지고 찍어보세요',
};

function circularDelta(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 캔버스 한 장에서 대표색을 뽑는다.
 *
 * @param {HTMLCanvasElement} canvas CameraStage 가 넘겨준 프레임
 * @returns {{ ok: true, hex: string, lch: {L,C,H}, achromatic: boolean }
 *          | { ok: false, fog: string }}
 *          ok:false 는 오류가 아니라 "지금은 판정할 수 없다"는 뜻이다.
 *          호출하는 쪽은 시도 횟수에 넣지 말고 다시 찍게 해야 한다.
 */
export function extractColor(canvas) {
  const size = Math.min(canvas.width, canvas.height);
  const crop = Math.max(1, Math.round(size * CROP));
  const sx = Math.round((canvas.width - crop) / 2);
  const sy = Math.round((canvas.height - crop) / 2);

  const small = document.createElement('canvas');
  small.width = GRID;
  small.height = GRID;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, sx, sy, crop, crop, 0, 0, GRID, GRID);
  const { data } = ctx.getImageData(0, 0, GRID, GRID);

  const total = GRID * GRID;
  const pixels = []; // 유효 픽셀의 OKLab + OKLCh
  let clipped = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= CLIP_CHANNEL && g >= CLIP_CHANNEL && b >= CLIP_CHANNEL) {
      clipped += 1;
      continue;
    }
    const lab = rgbToOklab(r, g, b);
    if (lab.L < L_MIN) {
      dark += 1;
      continue;
    }
    pixels.push({ ...lab, ...oklabToOklch(lab) });
  }

  // ── 안개 판정 — 오류 메시지 대신 게임 안의 연출로 흡수한다 ──
  if (pixels.length / total < MIN_VALID_RATIO) {
    return { ok: false, fog: clipped >= dark ? FOG.BLOWN : FOG.DARK };
  }

  const chromatic = pixels.filter((p) => p.C >= CHROMA_FLOOR);

  // 무채색 — 색상각이 의미 없다. 밝기만 대표로 뽑는다 (흰·검·회 출제용).
  if (chromatic.length / pixels.length < CHROMATIC_RATIO) {
    const L = median(pixels.map((p) => p.L));
    const hex = rgbToHex(oklabToRgb(L, 0, 0));
    return { ok: true, hex, lch: { L, C: 0, H: 0 }, achromatic: true };
  }

  // ── 가장 많이 보이는 색 무리 찾기 ──
  // 채도로 가중치를 준다. 옅게 색이 도는 회색 픽셀이 수로 이기면 안 된다 —
  // 사람이 보는 건 "저기 선명한 주황"이지 배경의 미묘한 색조가 아니다.
  const bins = new Array(BINS).fill(0);
  for (const p of chromatic) bins[Math.floor(p.H / BIN_DEG) % BINS] += p.C;
  let peak = 0;
  for (let i = 1; i < BINS; i += 1) if (bins[i] > bins[peak]) peak = i;
  const peakHue = peak * BIN_DEG + BIN_DEG / 2;

  const group = chromatic.filter((p) => circularDelta(p.H, peakHue) <= GATHER_DEG);
  const use = group.length > 0 ? group : chromatic;

  // a·b 는 벡터로 평균 낸다 — 각도를 산술평균하면 355도와 5도의 평균이 180도(청록)가 된다.
  // 밝기는 중앙값을 쓴다. 하이라이트 한 점이 평균을 끌어올리는 걸 막는다.
  const L = median(use.map((p) => p.L));
  const a = use.reduce((s, p) => s + p.a, 0) / use.length;
  const b = use.reduce((s, p) => s + p.b, 0) / use.length;

  return {
    ok: true,
    hex: rgbToHex(oklabToRgb(L, a, b)),
    lch: oklabToOklch({ L, a, b }),
    achromatic: false,
  };
}
