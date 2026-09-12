// '리듬 과일 자르기' — 아이패드 쪽 상수와 계산.
//
// 채점 규칙은 server/src/game/fruitEngine.js 가 원본이다. 여기 있는 값이 어긋나면
// 화면에 보이는 판정과 실제 점수가 달라지므로 반드시 같이 고칠 것.

// ── 채점 (엔진과 같은 값) ─────────────────────────────────────────────────
export const WINDOWS = [
  { id: 'perfect', ms: 90, points: 100, label: '완벽' },
  { id: 'good', ms: 170, points: 70, label: '좋음' },
  { id: 'graze', ms: 260, points: 40, label: '스침' },
];
export const MAX_HIT_MS = 260;
export const COMBO_STEP = 10;

// ── 날아다니는 모양 ───────────────────────────────────────────────────────
// 과일이 화면에 머무는 총 시간. 절반 지점(꼭대기)이 '치는 순간'이다.
export const FLIGHT_SEC = 1.6;
// 그래서 비트보다 이만큼 먼저 던져야 한다. 차트는 이 시간만큼 여유를 두고 시작한다.
export const LEAD_SEC = FLIGHT_SEC / 2;
// 화면 아래 바깥에서 출발해 위로 솟았다가 다시 내려간다 (0=위, 1=아래)
const Y_START = 1.15;
const Y_APEX = 0.28;

/**
 * 지금 이 순간 과일이 어디 있는가.
 * tNow 는 곡 재생 시작(0초) 기준. 화면 밖이면 visible=false.
 */
export function fruitPosition(node, tNow) {
  const u = (tNow - (node.t - LEAD_SEC)) / FLIGHT_SEC; // 0=던짐, 0.5=꼭대기, 1=사라짐
  if (u < 0 || u > 1) return { x: node.x, y: Y_START, visible: false, u };
  // 포물선: u=0.5 에서 꼭대기, 양 끝에서 Y_START
  const y = Y_START + (Y_APEX - Y_START) * (1 - (2 * u - 1) ** 2);
  // 살짝 옆으로 흐르게 해서 밋밋함을 던다 (drift 는 차트가 정해준다)
  const x = node.x + (node.drift ?? 0) * (u - 0.5);
  return { x, y, visible: true, u };
}

/** 과일이 꼭대기 근처라 '칠 수 있는' 구간인가 (판정 창과 같은 폭). */
export function isSliceable(node, tNow) {
  return Math.abs(tNow - node.t) * 1000 <= MAX_HIT_MS;
}

// ── 손으로 긋기 ───────────────────────────────────────────────────────────
// MediaPipe 손 랜드마크 중 검지 끝. 손바닥 중심보다 이쪽이 '칼끝'처럼 느껴진다.
export const BLADE_LANDMARK = 8;
// 이보다 느리면 자르지 않는다. 손을 펴서 가만히 대고 있으면 다 잘리는 걸 막는다
// (Fruit Ninja 의 핵심이 '휘두르는' 것이라 속도가 조건이어야 한다).
export const SLICE_SPEED_MIN = 0.9; // 화면 폭 기준 초당 이동량
// 칼끝이 과일 중심에서 이만큼 안으로 지나가면 잘린다 (화면 폭 기준)
export const SLICE_RADIUS = 0.09;
// 손 궤적을 몇 프레임 남길지
export const TRAIL_FRAMES = 12;

/**
 * 선분 p0→p1 이 중심 c 반지름 r 인 원을 지나가는가.
 * 프레임 사이에 손이 과일을 훌쩍 지나쳐도 놓치지 않으려면 점이 아니라 선분으로 봐야 한다.
 */
export function segmentHitsCircle(p0, p1, c, r) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-9) {
    t = ((c.x - p0.x) * dx + (c.y - p0.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = p0.x + t * dx;
  const qy = p0.y + t * dy;
  return (qx - c.x) ** 2 + (qy - c.y) ** 2 <= r * r;
}

// ── 차트 만들기 ───────────────────────────────────────────────────────────

export const FRUIT_KINDS = ['🍉', '🍊', '🍎', '🍋', '🥝', '🍑'];

/** 곡마다 같은 차트가 나오도록 씨앗을 고정한 난수 (사람마다 달라지면 억울하다). */
function seededRandom(seed) {
  let s = Math.floor(seed) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 구간 안에서 에너지를 0~1 로 펴준다. 곡마다 음량이 달라서 절대값은 못 쓴다. */
function normalizedEnergy(energy, startSec, playSec) {
  const slice = [];
  for (let i = Math.floor(startSec); i < Math.floor(startSec) + playSec; i += 1) {
    slice.push(energy[i] ?? 0);
  }
  const lo = Math.min(...slice);
  const hi = Math.max(...slice);
  const span = hi - lo;
  return (tRel) => {
    const v = slice[Math.floor(tRel)] ?? lo;
    return span > 1e-9 ? (v - lo) / span : 0.5;
  };
}

/**
 * 비트 격자와 음량에서 '과일 시각표'를 만든다.
 *
 * 박마다 하나씩 기계적으로 놓으면 75초 내내 똑같아서 지겹다. 그래서 음량을 보고
 * 밀도를 바꾼다 — 조용한 데서는 띄엄띄엄, 후렴에서는 촘촘하게, 제일 센 구간에서는
 * 양손으로 동시에 쳐야 하는 짝을 섞는다.
 *
 * 폭탄은 초반 몇 박은 넣지 않는다. 시작하자마자 콤보가 끊기면 김이 샌다.
 */
export function buildChart({ bpm, phaseSec, startSec, playSec, energy, seed = 1 }) {
  const rnd = seededRandom(seed);
  const at = normalizedEnergy(energy, startSec, playSec);
  const step = 60 / bpm;

  // 첫 비트는 곡 시작(startSec) 이후 첫 격자점
  let first = phaseSec;
  if (first < startSec) first += Math.ceil((startSec - first) / step) * step;

  const out = [];
  let beatIndex = 0;
  let sinceBomb = 0;

  for (let tAbs = first; tAbs < startSec + playSec; tAbs += step, beatIndex += 1) {
    const tRel = tAbs - startSec;
    // 던지는 시각이 0 보다 앞서면 화면 밖에서 시작해버린다 — 건너뛴다
    if (tRel < LEAD_SEC) continue;

    const e = at(tRel);
    sinceBomb += 1;

    // 조용한 구간은 두 박에 하나씩만
    if (e < 0.35 && beatIndex % 2 === 1) continue;

    // 폭탄 — 초반 4박은 넣지 않고, 최소 8박 간격
    if (beatIndex >= 4 && sinceBomb >= 8 && rnd() < 0.22) {
      out.push({ t: tRel, x: 0.2 + rnd() * 0.6, type: 'bomb', kind: '💣', drift: (rnd() - 0.5) * 0.12 });
      sinceBomb = 0;
      continue;
    }

    // 제일 센 구간에서는 양손 짝 — 왼쪽·오른쪽으로 갈라 놓아야 두 손이 다 쓰인다
    const pair = e > 0.72 && rnd() < 0.35;
    if (pair) {
      out.push({ t: tRel, x: 0.16 + rnd() * 0.18, type: 'fruit', kind: FRUIT_KINDS[Math.floor(rnd() * FRUIT_KINDS.length)], drift: (rnd() - 0.5) * 0.1 });
      out.push({ t: tRel, x: 0.66 + rnd() * 0.18, type: 'fruit', kind: FRUIT_KINDS[Math.floor(rnd() * FRUIT_KINDS.length)], drift: (rnd() - 0.5) * 0.1 });
    } else {
      out.push({ t: tRel, x: 0.12 + rnd() * 0.76, type: 'fruit', kind: FRUIT_KINDS[Math.floor(rnd() * FRUIT_KINDS.length)], drift: (rnd() - 0.5) * 0.14 });
    }
  }

  // 엔진이 오름차순을 요구한다 (짝을 넣으면서 같은 시각이 겹치므로 안정 정렬로)
  return out.map((n, i) => ({ ...n, i })).sort((a, b) => a.t - b.t || a.i - b.i);
}
