// '무궁화꽃이 피었습니다' — 화면이 쓰는 상수와 도우미.
// server/src/game/mugunghwaEngine.js 와 값을 맞춰야 한다.

export const APPROACH_SPEED = 0.1; // 최대로 흔들 때 초당 나아가는 거리(트랙 비율)
export const TAP_GAIN = 0.02; // 연타 한 번에 되돌아가는 거리
export const TOUCH_REACH = 0.985;
export const POSITION_SEND_MS = 80; // 위치 보고 간격 (약 12Hz)

// 흔들기 세기를 0~1 로 바꿀 때 쓰는 범위.
// 손떨림(0.2~0.5)은 걸러내고, 걷듯이 흔드는 3 이상이면 최대 속도가 되게 잡았다.
export const SHAKE_DEADZONE = 0.8;
export const SHAKE_FULL = 3.5;

export const STRICTNESS = [
  { id: 'loose', name: '느슨', desc: '웬만큼 흔들려도 봐준다' },
  { id: 'normal', name: '보통', desc: '일부러 움직이면 잡힌다' },
  { id: 'strict', name: '엄격', desc: '살짝만 움직여도 탈락' },
];

// 주자 색 (미로와 같은 팔레트 — 프로젝터로 멀리서도 구분되는 채도)
export const RUNNER_COLORS = [
  '#d84848', '#1878c0', '#48a848', '#d86048',
  '#783090', '#d84890', '#0f9b8e', '#c9971f',
  '#5b6ee1', '#8fae1b', '#e0562f', '#a0522d',
];

export function runnerColor(i) {
  const n = RUNNER_COLORS.length;
  return RUNNER_COLORS[(((i ?? 0) % n) + n) % n];
}

export const NAME_LABEL_MAX = 12; // 이보다 많으면 이름을 빼고 색으로만 구분한다

/** 흔들림 세기(m/s²) → 0~1. 가만히 든 손은 0 이 되도록 데드존을 둔다. */
export function shakeToSpeed(shake) {
  const s = Number(shake);
  if (!Number.isFinite(s) || s <= SHAKE_DEADZONE) return 0;
  return Math.min(1, (s - SHAKE_DEADZONE) / (SHAKE_FULL - SHAKE_DEADZONE));
}

export function clampPos(pos) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/**
 * "무궁화꽃이 피었습니다"를 한국어로 읽어준다 (대형화면 전용).
 *
 * 음원 없이 브라우저 음성 합성을 쓴다 — 외국인 참가자가 이 문장 자체를 듣고
 * 배우는 게 이 게임의 재미 중 하나다. 한국어 목소리가 없는 PC 도 있어서,
 * 없으면 조용히 넘어가고 화면 자막으로 대신한다.
 */
export function speakChant(rate = 1) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('무궁화 꽃이 피었습니다');
    u.lang = 'ko-KR';
    u.rate = Math.min(2, Math.max(0.5, rate));
    const korean = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ko'));
    if (korean) u.voice = korean;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopChant() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // 무시 — 소리가 안 나도 게임은 굴러가야 한다
  }
}
