// 미로 찾기의 순수 로직 (DB·소켓 의존 없음 — yabawiEngine.js 와 같은 방침).
//
// 기록은 서버가 잰다. 참여자가 "나 12.3초 걸렸어" 라고 보내온 값을 믿지 않고,
// 출발 시각과 완주 신호가 도착한 시각의 차이로 계산한다.

import { MAZES, MAZE_HEIGHT, MAZE_WIDTH } from './mazes.js';

export { MAZES, MAZE_HEIGHT, MAZE_WIDTH };

// 난이도 (운영 결정: 2단계).
// '상'은 벽에 스치기만 해도 출발점으로 되돌아간다. 공 크기는 '보통'과 같게 두어
// 일부러 빡빡하게 만들었고, 그만큼 점수를 1.5배 준다.
export const DIFFICULTIES = [
  { id: 'normal', name: '보통', desc: '벽에 부딪히면 멈춘다', resetOnWall: false, pointsScale: 1 },
  { id: 'hard', name: '상', desc: '벽에 닿으면 처음으로', resetOnWall: true, pointsScale: 1.5 },
];

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

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) ?? null;
}

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

export function pointsForRank(rank, scale = 1) {
  return Math.round((RANK_POINTS[rank] ?? FINISH_POINTS) * scale);
}

/**
 * 완주 기록을 순위로 바꾼다.
 * 같은 기록이면 같은 등수를 주고 다음 등수는 건너뛴다 (1,2,2,4 — 일반적인 경기 방식).
 *
 * @param {Map<number, number>} finishes participantId -> 걸린 시간(ms)
 * @returns {{participantId:number, elapsedMs:number, rank:number, points:number}[]}
 */
export function rankFinishers(finishes, scale = 1) {
  const rows = [...finishes.entries()]
    .map(([participantId, elapsedMs]) => ({ participantId, elapsedMs }))
    .sort((a, b) => a.elapsedMs - b.elapsedMs || a.participantId - b.participantId);

  return assignRanks(rows, (r) => r.elapsedMs, scale);
}

/**
 * 아무도 완주하지 못한 판의 순위 — "그 판에서 도달한 가장 먼 지점" 순으로 매긴다.
 *
 * 최종 위치로 재면 안 된다. '상' 난이도는 벽에 닿을 때마다 출발점으로 돌아가므로,
 * 시간이 끝난 순간의 위치는 대개 출발점 근처다. 판이 도는 내내 최소값을 갱신해온
 * bestRemaining 을 쓴다.
 *
 * @param {Map<number, number>} bestRemaining participantId -> 도달했던 최소 '남은 칸'
 */
export function rankByProgress(bestRemaining, scale = 1) {
  const rows = [...bestRemaining.entries()]
    .map(([participantId, remaining]) => ({ participantId, remaining }))
    .sort((a, b) => a.remaining - b.remaining || a.participantId - b.participantId);

  return assignRanks(rows, (r) => r.remaining, scale);
}

/** 같은 값이면 같은 등수를 주고 다음 등수는 건너뛴다 (1,2,2,4 — 일반적인 경기 방식). */
function assignRanks(rows, valueOf, scale) {
  let lastValue = null;
  let lastRank = 0;

  return rows.map((row, i) => {
    const value = valueOf(row);
    const rank = value === lastValue ? lastRank : i + 1;
    lastValue = value;
    lastRank = rank;
    return { ...row, rank, points: pointsForRank(rank, scale) };
  });
}

/** 초 단위 표기 ("12.34초") — 화면 세 곳에서 같은 형식을 써야 해서 여기 둔다. */
export function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(2)}초`;
}

// 벽 비트 (client/src/lib/maze.js 와 같은 값)
const N = 1, E = 2, S = 4, W = 8;

export function decodeCells(maze) {
  return [...maze.cells].map((ch) => parseInt(ch, 16));
}

/**
 * 각 칸에서 도착까지 남은 칸 수. 도착에서 거꾸로 BFS 한 번이면 전부 나온다.
 *
 * 진행도를 도착점까지의 직선거리로 재면 안 된다 — 미로라서 도착 바로 옆에 있어도
 * 벽에 막혀 한참 돌아가야 할 수 있다. 실시간 순위는 이 값으로 매긴다.
 */
export function goalDistances(cells, width = MAZE_WIDTH, height = MAZE_HEIGHT) {
  const dist = new Array(width * height).fill(-1);
  const goal = (height - 1) * width + (width - 1);
  dist[goal] = 0;
  const queue = [goal];

  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    const x = cur % width;
    const y = Math.floor(cur / width);
    for (const [dir, dx, dy] of [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]]) {
      if (cells[cur] & dir) continue; // 벽이 막고 있으면 못 지나간다
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (dist[next] !== -1) continue;
      dist[next] = dist[cur] + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** 공의 좌표(칸 단위)를 그 칸의 "남은 칸 수"로 바꾼다. 판 밖 값이 와도 잘라서 쓴다. */
export function remainingAt(dist, x, y, width = MAZE_WIDTH, height = MAZE_HEIGHT) {
  const cx = Math.min(width - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(height - 1, Math.max(0, Math.floor(y)));
  const d = dist[cy * width + cx];
  return d === -1 ? Number.MAX_SAFE_INTEGER : d;
}
