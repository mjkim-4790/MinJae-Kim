// 대형화면의 소리를 한 번에 열어준다.
//
// ── 왜 게임마다가 아니라 화면 전체인가 ────────────────────────────────────
// 브라우저는 사용자가 한 번 클릭하기 전에는 소리를 못 낸다. 그래서 게임마다
// '소리 켜기' 버튼을 뒀는데, 그 버튼은 **게임이 시작된 뒤에야** 화면에 나타났다.
// 대형화면은 아무도 손대지 않는 TV 라 그걸 누를 사람이 없고, 결국 첫 판은 늘
// 무음이었다 (의자 게임에서 "소리도 호루라기도 안 들린다"로 드러난 문제).
//
// 이제 화면을 켜두면 게임과 무관하게 버튼이 떠 있고, 행사 준비할 때 한 번 누르면
// 그 뒤로는 어느 게임이든 소리가 난다.

import * as chairsAudio from './chairsAudio.js';
import * as mugunghwaAudio from './mugunghwaAudio.js';
import { speakChant, stopChant } from './mugunghwa.js';

let armed = false;

export function isArmed() {
  return armed;
}

/**
 * 반드시 클릭 핸들러 안에서 부를 것.
 *
 * 음성 합성은 **클릭 안에서 한 번 말을 걸어둬야** 나중에 저절로 말할 수 있다.
 * await 보다 먼저 해야 같은 사용자 제스처 안에 든다.
 */
export async function arm() {
  try {
    speakChant(2);
    stopChant();
  } catch {
    // 음성이 없는 기기 — 효과음만이라도 살린다
  }

  const results = await Promise.all([
    chairsAudio.unlock().catch(() => false),
    mugunghwaAudio.unlock().catch(() => false),
  ]);
  armed = results.some(Boolean);
  return armed;
}
