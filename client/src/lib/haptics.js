// 폰을 짧게 울린다.
//
// ── 되는 기기와 안 되는 기기 ───────────────────────────────────────────────
// Vibration API 는 안드로이드 크롬에서는 동작하지만 **iOS 사파리는 지원하지 않는다**.
// 아이폰 참가자는 진동을 못 느낀다. 그래서 진동은 '있으면 좋은 덤'으로만 쓰고,
// 무슨 일이 일어났는지는 반드시 화면으로도 알려야 한다 — 진동만 믿고 화면 표시를
// 빼면 아이폰 쓰는 사람은 영문을 모른다.
//
// 브라우저는 사용자가 한 번이라도 화면을 건드린 적 없으면 진동을 무시한다.
// 게임 중에는 이미 시작 버튼을 눌렀으므로 문제되지 않는다.

export const canVibrate =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * @param {number|number[]} pattern 밀리초, 또는 [진동, 멈춤, 진동, …]
 * @returns {boolean} 실제로 울렸는지 (미지원이면 false)
 */
export function buzz(pattern) {
  if (!canVibrate) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    // 일부 기기는 배터리 절약 모드에서 예외를 던진다. 게임은 그대로 굴러가야 한다.
    return false;
  }
}

/** 미로에서 벽에 닿아 출발점으로 되돌아갈 때 — 짧게 두 번, "튕겼다"는 느낌. */
export function buzzWallHit() {
  return buzz([40, 60, 90]);
}
