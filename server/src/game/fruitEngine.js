// '리듬 과일 자르기' 채점 규칙.
//
// ── 판정은 아이패드가, 점수는 서버가 ─────────────────────────────────────
// 자르는 순간의 판정만은 아이패드가 할 수밖에 없다 — 서버엔 영상이 없고, 앞으로도
// 보내지 않는다. 대신 아이패드는 **무엇을 언제 쳤는지(번호와 오차 ms)** 만 보내고,
// 점수·콤보·배수는 전부 여기서 다시 계산한다. 아이패드가 보낸 점수는 받지 않는다.
// 곡 시각표(차트)도 시작할 때 한 번 받아두므로, 없는 과일을 쳤다거나 같은 과일을
// 두 번 쳤다는 주장은 서버가 걸러낸다.

// 판정 구간. 후해 보이지만 카메라로 손을 휘두르는 조작이라 터치보다 넉넉해야 한다.
export const WINDOWS = [
  { id: 'perfect', ms: 90, points: 100, label: '완벽' },
  { id: 'good', ms: 170, points: 70, label: '좋음' },
  { id: 'graze', ms: 260, points: 40, label: '스침' },
];
export const MAX_HIT_MS = 260;

// 콤보 배수 — 10콤보마다 +0.2, 최대 2배
export const COMBO_STEP = 10;
export const COMBO_STEP_BONUS = 0.2;
export const COMBO_MAX_MULT = 2;

// 차트 방어선 (아이패드가 보내는 값이라 상한을 둔다)
export const MAX_CHART_LEN = 800;
export const MAX_PLAY_SEC = 150;

/** 오차(ms)로 판정 등급을 낸다. 범위를 벗어나면 null. */
export function judge(dtMs) {
  const d = Math.abs(dtMs);
  return WINDOWS.find((w) => d <= w.ms) ?? null;
}

/** 콤보 배수. 0콤보면 1배. */
export function comboMultiplier(combo) {
  const steps = Math.floor(combo / COMBO_STEP);
  return Math.min(COMBO_MAX_MULT, 1 + steps * COMBO_STEP_BONUS);
}

/** 한 번 쳤을 때의 점수. 판정 밖이면 0. */
export function pointsFor(dtMs, comboBefore) {
  const w = judge(dtMs);
  if (!w) return 0;
  return Math.round(w.points * comboMultiplier(comboBefore));
}

/**
 * 아이패드가 보낸 차트가 쓸 만한지 본다.
 * 숫자만 들어 있어야 하고, 시각이 오름차순이어야 하며, 길이·시간 상한을 넘지 않아야 한다.
 */
export function isValidChart(chart) {
  if (!Array.isArray(chart) || chart.length === 0 || chart.length > MAX_CHART_LEN) return false;
  let last = -1;
  for (const n of chart) {
    if (!n || typeof n !== 'object') return false;
    const { t, x, type } = n;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > MAX_PLAY_SEC) return false;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1) return false;
    if (type !== 'fruit' && type !== 'bomb') return false;
    if (t < last) return false; // 시각이 뒤로 가면 안 된다
    last = t;
  }
  return true;
}

/**
 * 한 판을 통째로 채점한다.
 *
 * hits: [{ i, dtMs }] — 아이패드가 보낸, 친 과일 번호와 오차.
 * 서버가 차트를 들고 있으므로 번호가 실제로 있는지, 중복인지, 폭탄인지 전부 여기서 본다.
 */
export function scoreRun(chart, hits) {
  const seen = new Set();
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let sliced = 0;
  let bombs = 0;

  for (const h of hits) {
    const i = Number(h?.i);
    const dtMs = Number(h?.dtMs);
    if (!Number.isInteger(i) || i < 0 || i >= chart.length) continue; // 없는 과일
    if (seen.has(i)) continue; // 같은 걸 두 번
    if (!Number.isFinite(dtMs) || Math.abs(dtMs) > MAX_HIT_MS) continue; // 판정 밖
    seen.add(i);

    if (chart[i].type === 'bomb') {
      // 탈락은 없다 — 콤보만 끊긴다
      bombs += 1;
      combo = 0;
      continue;
    }
    score += pointsFor(dtMs, combo);
    combo += 1;
    sliced += 1;
    if (combo > maxCombo) maxCombo = combo;
  }

  const total = chart.filter((n) => n.type === 'fruit').length;
  // combo 는 '지금 이어지는' 콤보다. 곡이 흐르는 동안 화면에 띄우려고 같이 돌려준다 —
  // 점수 계산을 두 벌 두지 않으려고 매 타격마다 이 함수를 다시 돌린다.
  return { score, combo, maxCombo, sliced, total, bombs };
}
