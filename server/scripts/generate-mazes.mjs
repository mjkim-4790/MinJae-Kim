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

// 난이도마다 미로 크기가 다르다.
// '상'은 벽에 닿으면 출발점으로 돌아가므로 같은 크기면 너무 길어 아무도 못 깬다.
// 칸 수를 줄이면 경로가 짧아지는 동시에, 화면에 그릴 때 칸이 커져 통로도 넓어 보인다.
const SETS = [
  // '보통'은 원래 쓰던 조건 그대로 (floor((9+13)*1.6) = 35)
  { id: 'normal', width: 9, height: 13, minPath: 35, maxPath: 999 },
  { id: 'hard', width: 8, height: 11, minPath: 24, maxPath: 46 },
];
const COUNT = 20;

// 벽 비트: 북1 동2 남4 서8 (칸마다 네 벽을 다 들고 있다 — 중복이지만 읽기 쉽고 안전하다)
const N = 1, E = 2, S = 4, W = 8;
const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };

// 주의: 이 파일의 W 는 '서쪽 벽 비트(8)'다. 크기는 반드시 width/height 로 받는다
// (예전에 매개변수를 W 로 두었다가 벽 비트를 가려 미로가 직선으로 생성된 적이 있다).
const idx = (x, y, width) => y * width + x;
const inside = (x, y, width, height) => x >= 0 && x < width && y >= 0 && y < height;

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 재귀 백트래킹으로 완전미로(모든 칸이 연결되고 순환이 없는 미로)를 만든다. */
function carve(rand, width, height) {
  const cells = new Array(width * height).fill(N | E | S | W);
  const seen = new Array(width * height).fill(false);
  const stack = [[0, 0]];
  seen[idx(0, 0, width)] = true;

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1];
    const next = shuffled([N, E, S, W], rand).find((dir) => {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      return inside(nx, ny, width, height) && !seen[idx(nx, ny, width)];
    });

    if (next === undefined) {
      stack.pop();
      continue;
    }
    const nx = x + DX[next];
    const ny = y + DY[next];
    cells[idx(x, y, width)] &= ~next; // 지금 칸의 벽을 튼다
    cells[idx(nx, ny, width)] &= ~OPPOSITE[next]; // 맞은편 칸의 같은 벽도 함께 튼다
    seen[idx(nx, ny, width)] = true;
    stack.push([nx, ny]);
  }

  return cells;
}

/** 시작(0,0) → 도착(끝칸) 최단 경로 길이. 못 가면 -1. */
function solveLength(cells, width, height) {
  const start = idx(0, 0, width);
  const goal = idx(width - 1, height - 1, width);
  const dist = new Array(width * height).fill(-1);
  dist[start] = 0;
  const queue = [start];

  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    if (cur === goal) return dist[cur];
    const x = cur % width;
    const y = Math.floor(cur / width);
    for (const dir of [N, E, S, W]) {
      if (cells[cur] & dir) continue; // 벽이 있으면 못 간다
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!inside(nx, ny, width, height)) continue;
      const next = idx(nx, ny, width);
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

// 난이도마다 조건에 맞는 미로만 골라 담는다.
const built = {};
for (const set of SETS) {
  const picked = [];
  let seed = 1;
  while (picked.length < COUNT && seed < 200000) {
    const cells = carve(mulberry32(seed), set.width, set.height);
    const len = solveLength(cells, set.width, set.height);
    if (len >= set.minPath && len <= set.maxPath) {
      picked.push({
        cells: cells.map((c) => c.toString(16)).join(''),
        pathLength: len,
        width: set.width,
        height: set.height,
      });
    }
    seed += 1;
  }
  if (picked.length < COUNT) {
    console.error(`'${set.id}' 미로를 ${COUNT}개 못 만들었습니다 (${picked.length}개). 조건을 낮추세요.`);
    process.exit(1);
  }
  built[set.id] = { width: set.width, height: set.height, mazes: picked };
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/game/mazes.js');

const body = `// 자동 생성 파일 — 직접 고치지 마세요.
// 다시 만들려면: node server/scripts/generate-mazes.mjs
//
// cells 는 칸마다 벽 비트(북1 동2 남4 서8)를 16진수 한 글자로 적은 것이다.
// 왼쪽 위(0,0)에서 출발해 오른쪽 아래에 도착하면 완주다.
// 미로마다 width/height 를 들고 있으므로, 쓰는 쪽에서 크기를 따로 알 필요가 없다.
//
// '상'은 벽에 닿으면 출발점으로 돌아가서 같은 크기면 너무 길다. 그래서 칸 수를
// 줄인 별도 묶음을 쓴다 — 경로가 짧아지고, 화면에 그릴 때 칸이 커져 통로도 넓어진다.

export const MAZE_SETS = ${JSON.stringify(built, null, 2)};
`;

writeFileSync(out, body, 'utf8');
for (const set of SETS) {
  const lens = built[set.id].mazes.map((m) => m.pathLength);
  console.log(
    `${set.id}: ${set.width}x${set.height} · ${built[set.id].mazes.length}개 · 경로 ${Math.min(...lens)}~${Math.max(...lens)}칸`,
  );
}
console.log(`→ ${out}`);
