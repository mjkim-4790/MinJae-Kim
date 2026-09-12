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
// '상'은 한 사람에게 열 번 연달아 지시한다. 한두 번은 몸이 따라와도 열 번을 쉬지 않고
// 갈아타면 앞 지시의 잔상이 쌓여서 중간부터 손이 제멋대로 나간다. 시간도 조금 짧다.
export const DIFFICULTIES = [
  { id: 'normal', name: '보통', desc: '한 번 지시', beatCount: 1, answerMs: 2600 },
  { id: 'hard', name: '상', desc: '연속 10번 · 이겨/져 섞어서', beatCount: 10, answerMs: 2200 },
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

// 같은 지시가 이 횟수를 넘겨 이어지지 않게 막는다
export const MAX_SAME_RUN = 2;

/**
 * 한 사람의 차례를 통째로 뽑는다.
 *
 * ── 지시를 섞는 방식 ──────────────────────────────────────────────────────
 * 꼬박꼬박 번갈아 내면("이겨-져-이겨-져") 서너 번 만에 박자를 외워버려서 안 어렵다.
 * 그렇다고 완전 무작위로 두면 같은 지시가 네댓 번 이어지는 구간이 생기는데, 거기서
 * 몸이 적응해버려 역시 쉬워진다. 그래서 무작위로 뽑되 **같은 지시가 세 번 연달아
 * 나오지는 않게** 막는다 — 언제 갈아탈지 모르니 잔상이 가시질 않는다.
 *
 * 열 번이면 이 규칙만으로 '이겨'와 '져'가 반드시 둘 다 나온다 (세 번째에서 강제로
 * 갈아타므로).
 */
export function rollTurn(difficulty, random = Math.random) {
  const beats = [];
  for (let i = 0; i < difficulty.beatCount; i += 1) {
    const next = rollBeat(random);
    const a = beats[i - 1];
    const b = beats[i - 2];
    if (a && b && a.instruction === b.instruction) {
      next.instruction = a.instruction === 'win' ? 'lose' : 'win';
    }
    beats.push(next);
  }
  return beats;
}
