// 미로를 미리 만들어 server/src/game/mazes.js 로 저장한다.
//
// 게임을 시작할 때마다 미로를 만들지 않는 이유(운영 결정): 판마다 난이도가 들쭉날쭉하면
// 안 되고, 무엇보다 50명이 동시에 같은 미로를 봐야 하는데 생성을 실시간으로 하면
// 실패했을 때 복구할 방법이 없다. 미리 만들어 눈으로 확인한 것만 쓴다.
//
// 실행: node server/scripts/generate-mazes.mjs

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 9; // 세로로 긴 폰 화면에 맞춘 칸 수
const HEIGHT = 13;
const COUNT = 20;

// 벽 비트: 북1 동2 남4 서8 (칸마다 네 벽을 다 들고 있다 — 중복이지만 읽기 쉽고 안전하다)
const N = 1, E = 2, S = 4, W = 8;
const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };

const idx = (x, y) => y * WIDTH + x;
const inside = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 재귀 백트래킹으로 완전미로(모든 칸이 연결되고 순환이 없는 미로)를 만든다. */
function carve(rand) {
  const cells = new Array(WIDTH * HEIGHT).fill(N | E | S | W);
  const seen = new Array(WIDTH * HEIGHT).fill(false);
  const stack = [[0, 0]];
  seen[idx(0, 0)] = true;

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1];
    const next = shuffled([N, E, S, W], rand).find((dir) => {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      return inside(nx, ny) && !seen[idx(nx, ny)];
    });

    if (next === undefined) {
      stack.pop();
      continue;
    }
    const nx = x + DX[next];
    const ny = y + DY[next];
    cells[idx(x, y)] &= ~next; // 지금 칸의 벽을 튼다
    cells[idx(nx, ny)] &= ~OPPOSITE[next]; // 맞은편 칸의 같은 벽도 함께 튼다
    seen[idx(nx, ny)] = true;
    stack.push([nx, ny]);
  }

  return cells;
}

/** 시작(0,0) → 도착(끝칸) 최단 경로 길이. 못 가면 -1. */
function solveLength(cells) {
  const start = idx(0, 0);
    const goal = idx(WIDTH - 1, HEIGHT - 1);
  const dist = new Array(WIDTH * HEIGHT).fill(-1);
  dist[start] = 0;
  const queue = [start];

  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    if (cur === goal) return dist[cur];
    const x = cur % WIDTH;
    const y = Math.floor(cur / WIDTH);
    for (const dir of [N, E, S, W]) {
      if (cells[cur] & dir) continue; // 벽이 있으면 못 간다
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!inside(nx, ny)) continue;
      const next = idx(nx, ny);
      if (dist[next] !== -1) continue;
      dist[next] = dist[cur] + 1;
      queue.push(next);
    }
  }
  return dist[goal];
}

// 재현 가능한 난수 (mulberry32) — 같은 씨앗이면 같은 미로가 나와서, 나중에 다시
// 만들어도 결과가 달라지지 않는다.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 너무 쉬운 미로(거의 직선)는 버리고, 길이 넉넉한 것만 고른다.
const MIN_PATH = Math.floor((WIDTH + HEIGHT) * 1.6);

const picked = [];
let seed = 1;
while (picked.length < COUNT && seed < 100000) {
  const cells = carve(mulberry32(seed));
  const len = solveLength(cells);
  if (len >= MIN_PATH) {
    picked.push({ seed, len, cells: cells.map((c) => c.toString(16)).join('') });
  }
  seed += 1;
}

if (picked.length < COUNT) {
  console.error(`미로를 ${COUNT}개 못 만들었습니다 (${picked.length}개). 조건을 낮추세요.`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/game/mazes.js');

const body = `// 자동 생성 파일 — 직접 고치지 마세요.
// 다시 만들려면: node server/scripts/generate-mazes.mjs
//
// cells 는 칸마다 벽 비트(북1 동2 남4 서8)를 16진수 한 글자로 적은 것이다.
// 왼쪽 위(0,0)에서 출발해 오른쪽 아래(${WIDTH - 1},${HEIGHT - 1})에 도착하면 완주다.

export const MAZE_WIDTH = ${WIDTH};
export const MAZE_HEIGHT = ${HEIGHT};

export const MAZES = ${JSON.stringify(
  picked.map(({ cells, len }) => ({ cells, pathLength: len })),
  null,
  2,
)};
`;

writeFileSync(out, body, 'utf8');
console.log(`미로 ${picked.length}개 생성 → ${out}`);
console.log(`  최단경로 길이: 최소 ${Math.min(...picked.map((p) => p.len))} / 최대 ${Math.max(...picked.map((p) => p.len))}`);
