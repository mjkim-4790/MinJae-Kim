// 난이도 자동 조절 — "성공률을 올린다"가 아니라 **실패율을 일정 구간에 붙잡아 둔다**.
//
// 전부 통과하는 게임은 시시하고, 전부 실패하는 게임은 화난다. 사람들이 몰입하는
// 구간은 열 번에 두세 번 틀리는 정도다. 그래서 목표는 정답률이 아니라 실패율이다.
//
// 색깔 사냥은 색 판정 허용 배율에, 나중에 붙일 실루엣 통과는 일치율 임계에
// 같은 함수를 쓴다 (게임마다 조절하는 값만 다르고 원리는 같다).

export const TARGET_FAIL_LOW = 0.2;
export const TARGET_FAIL_HIGH = 0.3;

// 표본이 이보다 적으면 건드리지 않는다. 두 명이 찍은 판에서 실패율은 0 아니면 0.5 라
// 난이도가 매 라운드 요동친다 — 조절하지 않는 편이 낫다.
export const MIN_SAMPLE = 3;

/**
 * 다음 라운드에 쓸 파라미터.
 *
 * @param {number} current 지금 값
 * @param {number|null} failRate 이번 라운드 실패율 (0~1). null 이면 표본 없음
 * @param {object} opts
 * @param {number} opts.step 한 번에 움직이는 폭
 * @param {number} opts.min 하한
 * @param {number} opts.max 상한
 * @param {number} [opts.sampleSize] 표본 수. 적으면 조절을 건너뛴다
 * @param {boolean} [opts.easierIsHigher=true] 값이 커질수록 쉬워지는가
 *        (색 허용 배율은 커질수록 쉬움, 일치율 임계는 커질수록 어려움)
 * @returns {number} 새 값. 조절할 이유가 없으면 current 를 그대로 돌려준다
 */
export function adjust(current, failRate, { step, min, max, sampleSize = Infinity, easierIsHigher = true }) {
  const cur = Number(current);
  if (!Number.isFinite(cur)) return clamp(min, min, max);
  if (failRate == null || !Number.isFinite(failRate)) return cur;
  if (sampleSize < MIN_SAMPLE) return cur;

  // 너무 어려우면 쉽게, 너무 쉬우면 어렵게. 구간 안이면 그대로 둔다.
  let direction = 0;
  if (failRate > TARGET_FAIL_HIGH) direction = 1; // 쉽게
  else if (failRate < TARGET_FAIL_LOW) direction = -1; // 어렵게
  if (direction === 0) return cur;

  const delta = step * direction * (easierIsHigher ? 1 : -1);
  return clamp(round(cur + delta), min, max);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// 0.1 씩 더하다 보면 0.7000000000000001 같은 값이 쌓인다. 화면에 그대로 나가면
// 진행자가 이상하게 본다.
function round(v) {
  return Math.round(v * 1000) / 1000;
}
