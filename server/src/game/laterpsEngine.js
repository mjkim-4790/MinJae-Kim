// '후출 가위바위보'의 순수 로직 (DB·소켓 의존 없음 — mazeEngine.js 와 같은 방침).
//
// 화면 속 캐릭터가 먼저 손을 내고, 그 다음에 "이겨" 또는 "져" 지시가 떨어진다.
// 참가자는 지시대로 손을 내야 한다. 지는 쪽을 일부러 내야 할 때 손이 안 따라주는 게
// 이 놀이의 전부다 — 머리로는 알아도 몸이 습관대로 나간다.
//
// 손 모양 인식은 아이패드 안에서만 돈다. 서버로 오는 건 'rock'|'paper'|'scissors'
// 문자열 하나뿐이고, 맞았는지는 여기서 다시 판단한다 (색깔 사냥과 같은 방침).

export const HANDS = ['rock', 'paper', 'scissors'];

export const HAND_NAME = { rock: '바위', paper: '보', scissors: '가위' };
export const HAND_EMOJI = { rock: '✊', paper: '🖐️', scissors: '✌️' };

// MediaPipe 기본 제스처 이름 → 우리 손 모양.
// 이 세 개만 쓴다. Thumb_Up 이나 Pointing_Up 같은 건 가위바위보가 아니므로 버린다.
export const GESTURE_TO_HAND = {
  Closed_Fist: 'rock',
  Open_Palm: 'paper',
  Victory: 'scissors',
};

const WINS_AGAINST = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/** a 가 b 를 이기는가. */
export function beats(a, b) {
  return WINS_AGAINST[a] === b;
}

export const INSTRUCTIONS = [
  { id: 'win', name: '이겨', color: 'win' },
  { id: 'lose', name: '져', color: 'lose' },
];

/** 캐릭터가 낸 손과 지시로부터 '정답 손'을 구한다. */
export function expectedHand(characterHand, instruction) {
  if (!HANDS.includes(characterHand)) return null;
  return instruction === 'win'
    ? HANDS.find((h) => beats(h, characterHand)) ?? null
    : WINS_AGAINST[characterHand] ?? null; // 캐릭터가 이기는 손 = 참가자가 지는 손
}

/** 참가자가 낸 손이 지시에 맞는가. */
export function isCorrect(characterHand, instruction, playerHand) {
  if (!HANDS.includes(playerHand)) return false;
  return playerHand === expectedHand(characterHand, instruction);
}

// 난이도.
// '상'은 한 사람에게 두 번 연달아 지시한다 ("이긴 다음에 져"). 한 번은 몸이 따라와도
// 연속으로는 잘 안 된다 — 앞 지시의 잔상이 남아서다. 시간도 조금 짧다.
export const DIFFICULTIES = [
  { id: 'normal', name: '보통', desc: '한 번 지시', beatCount: 1, answerMs: 2600 },
  { id: 'hard', name: '상', desc: '연속 두 번 지시', beatCount: 2, answerMs: 2200 },
];

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) ?? null;
}

// 캐릭터가 손을 내고 나서 지시가 뜰 때까지의 뜸. 이 짧은 순간에 참가자가 먼저
// 반응해버리는 게(= 습관대로 이기는 손을 내는 것) 이 놀이의 함정이다.
export const REVEAL_GAP_MS = 700;
// 비트 사이 숨 돌리는 시간
export const BEAT_GAP_MS = 900;
// 호출된 사람이 카메라 앞에 설 시간
export const READY_MS = 2000;

// 점수 — 차감 없이 가점만 (색깔 사냥과 같은 방침).
// 맞히면 기본점, 빨리 낼수록 보너스. 틀리면 0 점이지 마이너스가 아니다.
const BASE_POINTS = 50;
const SPEED_BONUS = 30;

export function pointsFor(correct, elapsedMs, limitMs) {
  if (!correct) return 0;
  const left = Math.max(0, Math.min(1, 1 - (Number(elapsedMs) || 0) / (limitMs || 1)));
  return BASE_POINTS + Math.round(SPEED_BONUS * left);
}

/** 캐릭터가 낼 손과 지시를 뽑는다. */
export function rollBeat(random = Math.random) {
  return {
    hand: HANDS[Math.floor(random() * HANDS.length)],
    instruction: INSTRUCTIONS[Math.floor(random() * INSTRUCTIONS.length)].id,
  };
}

/**
 * 한 사람의 차례를 통째로 뽑는다.
 *
 * '상'에서 같은 지시가 두 번 연달아 나오면 두 번째가 너무 쉬워진다("또 이기라고?").
 * 그래서 두 번째는 앞과 다른 지시로 강제한다 — "이긴 다음에 져"가 이 놀이의 그림이다.
 */
export function rollTurn(difficulty, random = Math.random) {
  const beats = [rollBeat(random)];
  for (let i = 1; i < difficulty.beatCount; i += 1) {
    const prev = beats[i - 1];
    const next = rollBeat(random);
    next.instruction = prev.instruction === 'win' ? 'lose' : 'win';
    beats.push(next);
  }
  return beats;
}
