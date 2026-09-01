// 단어 구름 배치 — 외부 라이브러리 없이 직접 계산한다.
//
// 이 게임은 제출이 들어올 때마다 실시간으로 다시 그린다. 그래서 "예쁘게 배치"보다
// **자리가 안 튀는 것**이 훨씬 중요하다. 매번 처음부터 배치하면 단어 하나가 커질 때
// 화면 전체가 출렁여서 읽을 수가 없다.
//
// 그래서 배치는 이렇게 한다:
//  1) 많이 나온 단어부터 순서대로 자리를 정한다 (순서 = 우선권).
//  2) 각 단어는 "직전에 있던 자리"를 먼저 써보고, 거기가 막혔을 때만 새 자리를 찾는다.
// 위치는 0~1 비율로 돌려주므로, 화면 크기가 달라져도 같은 구도가 유지된다.

// 서버(server/src/game/wordcloudEngine.js)와 맞춘 값 — 한쪽만 바꾸면 안 된다.
export const MODES = [
  { id: 'buttons', name: '버튼 선택', desc: '내가 정한 단어를 참여자가 누른다' },
  { id: 'text', name: '직접 입력', desc: '참여자가 단어를 적어 낸다' },
];
export const MAX_PRESET_WORDS = 12;
export const MAX_WORD_LEN = 12;

/**
 * 서버 wordcloudEngine.normalizeWord 와 같은 규칙.
 * 화면에 곧바로 반영(낙관적 표시)할 때 서버와 다르게 다듬으면, 내 목록엔 "기대!" 인데
 * 구름엔 "기대" 로 나오는 어긋남이 생긴다. 그래서 규칙을 똑같이 맞춘다.
 * (둘 중 하나만 고치면 안 된다.)
 */
export function normalizeWord(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\p{P}+|\p{P}+$/gu, '')
    .trim();
  if (!cleaned) return null;
  if ([...cleaned].length > MAX_WORD_LEN) return null;
  return cleaned.toLowerCase();
}

/** 운영자가 쉼표·줄바꿈으로 적은 버튼 단어를 목록으로 바꾼다 (서버가 한 번 더 검증한다). */
export function parsePresetInput(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').split(/[\n,]/)) {
    const word = raw.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= MAX_PRESET_WORDS) break;
  }
  return out;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 나선을 고르게 벌리는 각도
const SPIRAL_STEP = 6; // 나선 한 걸음의 반지름 증가(px)
const MAX_SPIRAL_STEPS = 900;
const PADDING = 5; // 단어 사이 최소 간격(px)

/** 횟수 → 글자 크기(px). 제곱근 스케일이 시각적으로 가장 자연스럽다. */
export function fontSizeFor(count, maxCount, { min = 15, max = 74 } = {}) {
  if (maxCount <= 1) return Math.round((min + max) / 2);
  const t = Math.sqrt((count - 1) / (maxCount - 1)); // 0~1
  return Math.round(min + t * (max - min));
}

function overlaps(a, b) {
  return (
    a.x - a.w / 2 - PADDING < b.x + b.w / 2 &&
    a.x + a.w / 2 + PADDING > b.x - b.w / 2 &&
    a.y - a.h / 2 - PADDING < b.y + b.h / 2 &&
    a.y + a.h / 2 + PADDING > b.y - b.h / 2
  );
}

function insideBoard(box, width, height) {
  return (
    box.x - box.w / 2 >= 0 &&
    box.x + box.w / 2 <= width &&
    box.y - box.h / 2 >= 0 &&
    box.y + box.h / 2 <= height
  );
}

/**
 * 중심에서 나선을 그리며 바깥으로 나가면서, 아무와도 안 겹치는 첫 자리를 찾는다.
 * @returns {{x:number,y:number}|null} 판 안에 넣을 자리가 없으면 null
 */
function findSpot(box, placed, width, height) {
  const cx = width / 2;
  const cy = height / 2;

  for (let i = 0; i < MAX_SPIRAL_STEPS; i += 1) {
    const angle = i * GOLDEN_ANGLE;
    const radius = SPIRAL_STEP * Math.sqrt(i);
    // 가로로 넓은 판에서는 가로로 더 퍼지게 (세로로 길쭉하게 쌓이는 걸 막는다)
    const candidate = {
      ...box,
      x: cx + Math.cos(angle) * radius * (width / height),
      y: cy + Math.sin(angle) * radius,
    };
    if (!insideBoard(candidate, width, height)) continue;
    if (placed.some((p) => overlaps(candidate, p))) continue;
    return { x: candidate.x, y: candidate.y };
  }
  return null;
}

/**
 * 단어 구름 한 판을 배치한다.
 *
 * @param {{word:string,count:number}[]} words  서버가 준 순서(횟수 내림차순) 그대로 넣을 것
 * @param {(word:string,fontSize:number)=>{w:number,h:number}} measure  글자 크기 측정 함수
 * @param {{width:number,height:number}} board
 * @param {Map<string,{xRatio:number,yRatio:number,fontSize:number}>} previous  직전 배치 결과
 * @returns {{placed:Array,dropped:string[]}} placed 항목은 0~1 비율 좌표를 담는다
 */
export function layoutWords(words, measure, board, previous = new Map()) {
  const { width, height } = board;
  if (!width || !height || words.length === 0) return { placed: [], dropped: [] };

  const maxCount = words[0]?.count ?? 1;
  const boxes = words.map(({ word, count }) => {
    const fontSize = fontSizeFor(count, maxCount);
    const { w, h } = measure(word, fontSize);
    return { word, count, fontSize, w, h };
  });

  const placed = [];
  const dropped = [];

  // 많이 나온 단어부터 자리를 정한다. 순서가 곧 우선권이라, 1위 단어는 늘 먼저
  // 고른다 — 자리 지키기를 먼저 하면 새로 1위가 된 큰 단어가 밀려나 아예 안 그려진다
  // (실제로 그 버그가 났었다).
  //
  // 각 단어는 "직전에 있던 자리"를 먼저 시도하고, 그 자리가 비어 있지 않을 때만
  // 새 자리를 찾는다. 그래서 대부분의 단어는 갱신돼도 제자리에 머문다.
  for (const box of boxes) {
    const prev = previous.get(box.word);
    if (prev) {
      const candidate = { ...box, x: prev.xRatio * width, y: prev.yRatio * height };
      if (insideBoard(candidate, width, height) && !placed.some((p) => overlaps(candidate, p))) {
        placed.push(candidate);
        continue;
      }
    }
    const spot = findSpot(box, placed, width, height);
    if (spot) placed.push({ ...box, ...spot });
    else dropped.push(box.word); // 판이 꽉 참 — 이번 갱신에는 안 그린다
  }

  return {
    placed: placed.map((p) => ({
      word: p.word,
      count: p.count,
      fontSize: p.fontSize,
      xRatio: p.x / width,
      yRatio: p.y / height,
    })),
    dropped,
  };
}

/**
 * 캔버스로 글자 크기를 재는 측정 함수를 만든다.
 * DOM 에 붙였다 떼며 재면 매번 레이아웃이 발생해서 실시간 갱신에 쓸 수 없다.
 */
export function createMeasurer(fontFamily) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const cache = new Map();

  return (word, fontSize) => {
    const key = `${fontSize}:${word}`;
    const hit = cache.get(key);
    if (hit) return hit;

    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    const m = ctx.measureText(word);
    const size = {
      w: Math.ceil(m.width),
      // 폰트마다 실제 높이가 달라 actualBoundingBox 를 쓰되, 없으면 1.2배로 어림한다
      h: Math.ceil(
        (m.actualBoundingBoxAscent ?? fontSize * 0.8) + (m.actualBoundingBoxDescent ?? fontSize * 0.2),
      ),
    };
    cache.set(key, size);
    return size;
  };
}
