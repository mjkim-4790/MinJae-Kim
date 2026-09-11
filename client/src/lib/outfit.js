// '옷 입어보기' 화면이 쓰는 값과 도우미.
//
// 이 파일이 하는 일 셋:
//  1) 옷 사진에서 배경을 지운다 (네 모서리 색을 배경으로 보고 그 색에 가까운
//     픽셀을 투명하게 만든다)
//  2) 지워진 사진에서 "어깨선·엉덩이선"을 추정한다 (실제 얼굴/관절 인식이 아니라
//     남은 픽셀의 테두리 상자를 쓴다 — 옷마다 위치가 다른 걸 이 정도로 맞춘다)
//  3) 그 세 점을 카메라가 잡은 내 몸의 세 점(양어깨·엉덩이 중점)에 맞춰
//     기울이고 늘이는 변환 행렬을 계산한다
//
// ── 이 방식의 한계 ─────────────────────────────────────────────────────────
// 평면 사진을 3점 아핀 변환(이동·회전·확대·기울임)으로만 맞춘다. 원근 왜곡이나
// 옷감의 주름·그림자는 생기지 않고, 팔을 벌리거나 몸을 돌리면 소매가 팔을
// 따라가지 못한다. 정면으로 서 있을 때 가장 그럴듯하다 — 이건 실사 합성이 아니라
// "이 색·이 실루엣이 나한테 얼마나 어울리는지" 를 가늠해보는 재미다.

import { rgbToOklab } from './color.js';

// ── 업로드(폰) ───────────────────────────────────────────────────────────
export const UPLOAD_MAX_DIM = 800; // 이보다 큰 변은 줄인다
export const UPLOAD_JPEG_QUALITY = 0.82;

/**
 * 폰에서 고른 파일을 800px 이하로 줄여 JPEG data URL 로 만든다.
 * 서버 한도(outfitEngine.MAX_IMAGE_CHARS)보다 훨씬 작게 나오도록 여기서 먼저 줄인다.
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, UPLOAD_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했습니다'));
    };
    img.src = url;
  });
}

// ── 배경 제거 ────────────────────────────────────────────────────────────
const CORNER_BLOCK = 8; // 모서리에서 배경색을 뽑을 정사각형 한 변(px)
const BG_DISTANCE = 0.06; // 이 안쪽이면 배경으로 본다 (OKLab 거리)
const BG_FEATHER = 0.05; // 경계에서 이만큼 더 번지며 알파가 0→1 로 부드럽게 바뀐다

/** 이미지 네 모서리의 평균 OKLab — 배경색으로 삼는다. */
function backgroundLab(imageData) {
  const { data, width, height } = imageData;
  const corners = [
    [0, 0], [width - CORNER_BLOCK, 0],
    [0, height - CORNER_BLOCK], [width - CORNER_BLOCK, height - CORNER_BLOCK],
  ];
  let L = 0, a = 0, b = 0, n = 0;
  for (const [cx, cy] of corners) {
    for (let y = Math.max(0, cy); y < Math.min(height, cy + CORNER_BLOCK); y++) {
      for (let x = Math.max(0, cx); x < Math.min(width, cx + CORNER_BLOCK); x++) {
        const i = (y * width + x) * 4;
        const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
        L += lab.L; a += lab.a; b += lab.b; n += 1;
      }
    }
  }
  return n === 0 ? { L: 1, a: 0, b: 0 } : { L: L / n, a: a / n, b: b / n };
}

/**
 * 배경을 지운 새 캔버스를 돌려준다 (원본은 건드리지 않는다).
 * 한 번만 계산해서 옷을 고를 때(선택이 바뀔 때)만 다시 하면 된다 — 매 프레임 할
 * 만큼 가볍지 않다.
 */
export function removeBackground(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const bg = backgroundLab(imageData);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
    const d = Math.hypot(lab.L - bg.L, lab.a - bg.a, lab.b - bg.b);
    if (d < BG_DISTANCE) {
      data[i + 3] = 0;
    } else if (d < BG_DISTANCE + BG_FEATHER) {
      // 경계를 딱 자르면 톱니처럼 보인다 — 배경에서 옷으로 넘어가는 좁은 띠만 부드럽게 번지게 한다
      const t = (d - BG_DISTANCE) / BG_FEATHER;
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return out;
}

// ── 어깨/엉덩이 추정 ─────────────────────────────────────────────────────
// 알파가 이보다 크면 "옷이 있는 픽셀"로 본다 (배경 제거의 번짐 구간은 제외)
const ALPHA_THRESHOLD = 40;

/** 배경 제거된 캔버스에서 옷이 차지하는 사각형. 빈 이미지면 캔버스 전체를 쓴다. */
export function boundingBoxOfAlpha(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w, h }; // 전부 지워졌으면 원본 크기로
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 옷 사진 안에서 "어깨선·엉덩이 중점"으로 볼 세 점.
 *
 * 실제 옷의 관절 위치를 아는 게 아니라, 정면에서 찍은 상의/원피스 사진이라면
 * 대개 위쪽 15% 부근이 어깨 폭, 아래쪽 80% 부근이 엉덩이 폭이라는 경험적 비율이다.
 */
export function templatePoints(bbox) {
  const shoulderY = bbox.y + bbox.h * 0.14;
  return {
    shoulderL: { x: bbox.x + bbox.w * 0.16, y: shoulderY },
    shoulderR: { x: bbox.x + bbox.w * 0.84, y: shoulderY },
    hipCenter: { x: bbox.x + bbox.w * 0.5, y: bbox.y + bbox.h * 0.82 },
  };
}

// ── 3점 아핀 변환 ────────────────────────────────────────────────────────

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null; // 세 점이 일직선이면 풀 수 없다
  const k = 1 / det;
  return [
    [A * k, D * k, G * k],
    [B * k, E * k, H * k],
    [C * k, F * k, I * k],
  ];
}

/**
 * 세 점 src 를 세 점 dst 로 보내는 아핀 변환.
 * @param {[{x,y},{x,y},{x,y}]} src
 * @param {[{x,y},{x,y},{x,y}]} dst
 * @returns {{a,b,c,d,e,f}|null} ctx.setTransform(a,b,c,d,e,f) 에 그대로 쓴다.
 *   null 이면 (세 점이 일직선 등) 이번 프레임은 그리지 않는다.
 */
export function solveAffine(src, dst) {
  const M = src.map((p) => [p.x, p.y, 1]);
  const inv = invert3(M);
  if (!inv) return null;
  const mulVec = (vec) => inv.map((row) => row[0] * vec[0] + row[1] * vec[1] + row[2] * vec[2]);
  const [a, c, e] = mulVec(dst.map((p) => p.x));
  const [b, d, f] = mulVec(dst.map((p) => p.y));
  return { a, b, c, d, e, f };
}

// ── 좌표 변환 ────────────────────────────────────────────────────────────

/**
 * 비디오의 정규화 좌표(0~1)를, object-fit:cover 로 표시된 캔버스의 픽셀 좌표로 바꾼다.
 * MediaPipe 랜드마크는 비디오 원본 프레임 기준이라, 화면에 잘려 보이는 만큼
 * 어긋나지 않으려면 이 계산이 필요하다.
 */
export function videoPointToCanvas(nx, ny, videoW, videoH, canvasW, canvasH) {
  const scale = Math.max(canvasW / videoW, canvasH / videoH);
  const offsetX = (canvasW - videoW * scale) / 2;
  const offsetY = (canvasH - videoH * scale) / 2;
  return { x: nx * videoW * scale + offsetX, y: ny * videoH * scale + offsetY };
}

// ── 흔들림 완화 ──────────────────────────────────────────────────────────
export const SMOOTH_FRAMES = 5;

/**
 * 최근 몇 프레임의 평균으로 떨림을 줄인다.
 * @param {{x,y}[]} history 오래된 것부터 최신 순
 * @param {{x,y}|null} next 이번 프레임 값 (안 보이면 null — 이번엔 안 밀어 넣는다)
 * @returns {{history: {x,y}[], avg: {x,y}|null}}
 */
export function pushSmoothed(history, next, maxLen = SMOOTH_FRAMES) {
  if (!next) return { history, avg: history.length ? average(history) : null };
  const updated = [...history, next].slice(-maxLen);
  return { history: updated, avg: average(updated) };
}

function average(points) {
  const n = points.length;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

// MediaPipe Pose 33점 중 이 코너가 쓰는 것 (실루엣 통과와 같은 인덱스, 여기 따로 둔다 —
// 이 코너만의 관심사라 실루엣 모듈에 얹지 않는다)
export const LM = { shoulderL: 11, shoulderR: 12, hipL: 23, hipR: 24 };
const MIN_VISIBILITY = 0.5;

/** 랜드마크 33점에서 어깨 두 점과 엉덩이 중점을 뽑는다. 못 잡으면 null. */
export function bodyAnchorsFromLandmarks(landmarks) {
  if (!landmarks) return null;
  const get = (idx) => {
    const p = landmarks[idx];
    if (!p || (p.visibility ?? 1) < MIN_VISIBILITY) return null;
    return { x: p.x, y: p.y };
  };
  const shoulderL = get(LM.shoulderL);
  const shoulderR = get(LM.shoulderR);
  const hipL = get(LM.hipL);
  const hipR = get(LM.hipR);
  if (!shoulderL || !shoulderR || !hipL || !hipR) return null;
  return { shoulderL, shoulderR, hipCenter: { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 } };
}
