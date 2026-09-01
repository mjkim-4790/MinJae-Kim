// 미로 찾기의 순수 로직 (DB·소켓 의존 없음 — yabawiEngine.js 와 같은 방침).
//
// 기록은 서버가 잰다. 참여자가 "나 12.3초 걸렸어" 라고 보내온 값을 믿지 않고,
// 출발 시각과 완주 신호가 도착한 시각의 차이로 계산한다.

import { MAZES, MAZE_HEIGHT, MAZE_WIDTH } from './mazes.js';

export { MAZES, MAZE_HEIGHT, MAZE_WIDTH };

export const CONTROLS = [
  { id: 'tilt', name: '기울기', desc: '폰을 기울여 굴린다' },
  { id: 'buttons', name: '버튼', desc: '화면 방향 버튼으로 굴린다' },
];

export const TIME_LIMITS = [
  { id: 60, name: '60초' },
  { id: 90, name: '90초' },
  { id: 120, name: '120초' },
];

export const COUNTDOWN_MS = 3000; // 다 같이 출발하도록 3초 센다
export const WARN_MS = 5000; // 남은 시간이 이보다 적으면 화면에 카운트다운을 띄운다

// 순위별 점수 (운영 결정: 1등 100 / 2등 80 / 3등 60 / 나머지 완주자 30)
const RANK_POINTS = { 1: 100, 2: 80, 3: 60 };
const FINISH_POINTS = 30;

export function controlById(id) {
  return CONTROLS.find((c) => c.id === id) ?? null;
}

export function timeLimitById(id) {
  return TIME_LIMITS.find((t) => t.id === Number(id)) ?? null;
}

export function pickMazeIndex(random = Math.random) {
  return Math.floor(random() * MAZES.length);
}

export function mazeAt(index) {
  return MAZES[index] ?? null;
}

export function pointsForRank(rank) {
  return RANK_POINTS[rank] ?? FINISH_POINTS;
}

/**
 * 완주 기록을 순위로 바꾼다.
 * 같은 기록이면 같은 등수를 주고 다음 등수는 건너뛴다 (1,2,2,4 — 일반적인 경기 방식).
 *
 * @param {Map<number, number>} finishes participantId -> 걸린 시간(ms)
 * @returns {{participantId:number, elapsedMs:number, rank:number, points:number}[]}
 */
export function rankFinishers(finishes) {
  const rows = [...finishes.entries()]
    .map(([participantId, elapsedMs]) => ({ participantId, elapsedMs }))
    .sort((a, b) => a.elapsedMs - b.elapsedMs || a.participantId - b.participantId);

  let lastElapsed = null;
  let lastRank = 0;

  return rows.map((row, i) => {
    const rank = row.elapsedMs === lastElapsed ? lastRank : i + 1;
    lastElapsed = row.elapsedMs;
    lastRank = rank;
    return { ...row, rank, points: pointsForRank(rank) };
  });
}

/** 초 단위 표기 ("12.34초") — 화면 세 곳에서 같은 형식을 써야 해서 여기 둔다. */
export function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(2)}초`;
}
