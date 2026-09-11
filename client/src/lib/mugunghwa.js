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

// 구호를 끊어 읽을 덩이. 한 문장으로 읽으면 그냥 안내방송처럼 들린다.
// 덩이로 나눠 큐에 넣으면 사이가 살짝 벌어져 인형이 또박또박 읊는 느낌이 난다.
const CHANT_CHUNKS = ['무궁화', '꽃이', '피었습니다'];

// 어린아이 목소리를 만드는 값. pitch 는 브라우저 상한이 2 인데, 2.0 은 소리가
// 깨져서 바로 아래에 둔다.
const CHILD_PITCH = 1.9;

// 읽는 속도는 서버가 매 구호마다 새로 뽑아 내려준다. 라운드에 따라 여기서 계산하던
// 때는 박자가 판마다 일정해서, 사람들이 "지금쯤 끝나겠다"를 외워버렸다.
const FALLBACK_RATE = 1.2;

// 어느 한국어 목소리를 고르느냐가 음높이보다 결과를 더 크게 좌우한다.
// 각 OS 의 표준 목소리 이름 — 음높이를 올렸을 때 아이처럼 들리는 것들이다.
const PREFERRED_VOICES = ['yuna', 'heami', 'sunhi', 'google', 'nara', 'sora', '한국'];

// macOS 는 Korean 목록 맨 앞에 장난 목소리를 둔다. 그냥 첫 번째를 집으면
// 어린아이가 아니라 코미디가 된다 (실제로 Eddy 가 잡혔다).
const NOVELTY_VOICES = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley'];

/** 아이 목소리로 쓸 한국어 음성을 고른다. 못 찾으면 null (브라우저 기본값). */
export function pickChantVoice(voices) {
  const ko = (voices ?? []).filter((v) => v.lang?.startsWith('ko'));
  if (ko.length === 0) return null;
  const name = (v) => (v.name ?? '').toLowerCase();
  for (const want of PREFERRED_VOICES) {
    const hit = ko.find((v) => name(v).includes(want));
    if (hit) return hit;
  }
  return ko.find((v) => !NOVELTY_VOICES.some((n) => name(v).includes(n))) ?? ko[0];
}

/**
 * "무궁화꽃이 피었습니다"를 읽어준다 (대형화면 전용).
 *
 * 음원 없이 브라우저 음성 합성을 쓴다 — 외국인 참가자가 이 문장 자체를 듣고
 * 배우는 게 이 게임의 재미 중 하나다. 한국어 목소리가 없는 PC 도 있어서,
 * 없으면 조용히 넘어가고 화면 자막으로 대신한다.
 *
 * 음높이를 끝까지 올려 어린아이 목소리로 만든다. 드라마의 실제 음원은 저작권이
 * 있어 쓸 수 없어서, 합성 음성으로 그 분위기에 가깝게 맞춘 것이다.
 *
 * 읽는 속도는 **서버가 정해서 내려준 값**을 쓴다. 매번 달라지고, 빨간불이 켜지는
 * 시각과 맞아야 하기 때문이다. 화면이 제멋대로 정하면 말과 불이 어긋난다.
 *
 * @param rate 이번 구호를 읽을 속도 (서버가 준 값)
 */
export function speakChant(rate = FALLBACK_RATE) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const korean = pickChantVoice(synth.getVoices());
    const r = Math.min(2, Math.max(0.5, Number(rate) || FALLBACK_RATE));
    for (const chunk of CHANT_CHUNKS) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = 'ko-KR';
      u.rate = r;
      u.pitch = CHILD_PITCH;
      u.volume = 1;
      if (korean) u.voice = korean;
      synth.speak(u);
    }
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
