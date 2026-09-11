// '후출 가위바위보' 화면이 쓰는 값. server/src/game/laterpsEngine.js 와 맞춰야 한다.

export const HAND_NAME = { rock: '바위', paper: '보', scissors: '가위' };
export const HAND_EMOJI = { rock: '✊', paper: '🖐️', scissors: '✌️' };

export const GESTURE_TO_HAND = {
  Closed_Fist: 'rock',
  Open_Palm: 'paper',
  Victory: 'scissors',
};

export const DIFFICULTIES = [
  { id: 'normal', name: '보통', desc: '한 번 지시' },
  { id: 'hard', name: '상', desc: '연속 두 번 지시' },
];

// 이 점수 아래는 못 본 것으로 친다. MediaPipe 는 애매한 손도 일단 이름을 붙여 주는데,
// 그걸 그대로 받으면 손을 내다 마는 중간 모양이 답으로 굳어버린다.
export const MIN_SCORE = 0.6;

// 같은 손이 이만큼 연속으로 보여야 확정한다.
// 한 프레임만 보고 확정하면 주먹에서 보로 펴는 도중의 한 장이 '바위'로 잡힌다.
// 아이패드가 30fps 쯤 도니 3프레임은 0.1초 — 사람은 못 느끼고 흔들림만 걸러진다.
export const STABLE_FRAMES = 3;

/**
 * 프레임마다 들어오는 인식 결과를 모아 '확정된 손'을 만든다.
 *
 * 상태를 밖에 두고 쓰는 순수 함수 — 컴포넌트가 ref 하나만 들고 있으면 된다.
 * @param {{hand: string|null, count: number}} store 직전까지의 누적 (호출자가 보관)
 * @param {string|null} gesture MediaPipe 가 준 제스처 이름
 * @param {number} score
 * @returns {string|null} 방금 확정된 손 (확정 순간에만 값, 그 외에는 null)
 */
export function feedGesture(store, gesture, score) {
  const hand = score >= MIN_SCORE ? GESTURE_TO_HAND[gesture] ?? null : null;
  if (!hand) {
    store.hand = null;
    store.count = 0;
    return null;
  }
  if (store.hand === hand) {
    store.count += 1;
  } else {
    store.hand = hand;
    store.count = 1;
  }
  // 확정된 뒤에도 계속 세면 같은 손을 여러 번 확정하게 된다. 딱 그 프레임에만 알린다.
  return store.count === STABLE_FRAMES ? hand : null;
}

/** 손 뼈대를 그릴 때 잇는 점들 (MediaPipe 손 21점 규격). */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
