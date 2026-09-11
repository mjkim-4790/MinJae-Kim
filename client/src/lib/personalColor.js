// '퍼스널컬러 찾아보기' 화면이 쓰는 값.
// server/src/game/personalColorEngine.js 와 맞춰야 한다.

import { oklabToOklch, oklabToRgb, rgbToHex, rgbToOklab } from './color.js';

// 카메라가 읽는 영역 — 화면 가운데 얼굴이 올 자리.
// 색깔 사냥(0.4)보다 좁게 잡는다. 얼굴 주변 배경이 섞이면 피부톤이 아니라
// 벽 색을 읽게 된다.
const CROP = 0.26;
const GRID = 32;

// 사람 피부의 OKLCh 범위. 이 밖은 배경이나 옷으로 보고 버린다.
// 넉넉히 잡았다 — 피부색은 생각보다 폭이 넓고, 좁게 자르면 아무것도 안 남는다.
const SKIN = { lMin: 0.35, lMax: 0.95, cMin: 0.02, cMax: 0.16, hMin: 20, hMax: 100 };
// 유효 픽셀이 이 비율보다 적으면 얼굴을 못 찾은 것으로 본다
const MIN_SKIN_RATIO = 0.25;

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 화면 가운데에서 피부톤을 읽는다.
 *
 * 얼굴 인식을 쓰지 않는다. 이 코너는 아이패드 앞에 한 명이 서서 화면을 보며
 * 얼굴을 맞추는 구조라, 가운데를 읽는 것만으로 충분하고 모델을 더 받을 이유가 없다.
 *
 * @returns {{ ok: true, hex: string, lch: object, ratio: number }
 *          | { ok: false, reason: string }}
 */
export function readSkinTone(video) {
  if (!video || !video.videoWidth) return { ok: false, reason: '카메라를 준비하는 중…' };

  const size = Math.min(video.videoWidth, video.videoHeight);
  const crop = Math.max(1, Math.round(size * CROP));
  const sx = Math.round((video.videoWidth - crop) / 2);
  const sy = Math.round((video.videoHeight - crop) / 2);

  const c = document.createElement('canvas');
  c.width = GRID;
  c.height = GRID;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, crop, crop, 0, 0, GRID, GRID);
  const { data } = ctx.getImageData(0, 0, GRID, GRID);

  const skin = [];
  const total = GRID * GRID;
  for (let i = 0; i < data.length; i += 4) {
    const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
    const lch = oklabToOklch(lab);
    if (lch.L < SKIN.lMin || lch.L > SKIN.lMax) continue;
    if (lch.C < SKIN.cMin || lch.C > SKIN.cMax) continue;
    if (lch.H < SKIN.hMin || lch.H > SKIN.hMax) continue;
    skin.push({ ...lab, ...lch });
  }

  const ratio = skin.length / total;
  if (ratio < MIN_SKIN_RATIO) {
    return { ok: false, reason: '얼굴을 화면 가운데 동그라미에 맞춰주세요' };
  }

  // 평균이 아니라 중앙값 — 머리카락 한 가닥이나 안경테가 끼어도 흔들리지 않는다
  const L = median(skin.map((p) => p.L));
  const a = median(skin.map((p) => p.a));
  const b = median(skin.map((p) => p.b));
  // 서버로는 hex 한 개만 보낸다. 얼굴도, 픽셀도, 관절도 보내지 않는다.
  return { ok: true, lch: oklabToOklch({ L, a, b }), ratio, hex: rgbToHex(oklabToRgb(L, a, b)) };
}

// 카메라를 읽는 간격. 사람이 가만히 서 있으므로 자주 읽을 이유가 없다.
export const SKIN_READ_MS = 400;
