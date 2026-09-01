// 미로 렌더링과 공 물리.
//
// 조작감은 "약한 관성"이다 (운영 결정): 기울이면 가속하되 수평으로 두면 금방 멈춘다.
// 진짜 구슬처럼 계속 미끄러지면 회식 자리에서 아무도 못 깨고, 관성이 아예 없으면
// 굴러가는 맛이 없다. 그 사이를 노린 값이 아래 상수들이다.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

// 물리 상수 (칸 단위/초). 셀 크기가 화면마다 달라도 느낌이 같도록 px 가 아니라
// "칸" 기준으로 계산하고, 그릴 때만 px 로 바꾼다.
export const ACCEL = 26; // 최대로 기울였을 때 가속도 (칸/초²)
export const DAMPING = 7.5; // 속도에 비례해 깎이는 저항 — 이 값이 클수록 빨리 멈춘다
export const MAX_SPEED = 7.5; // 칸/초 — 벽을 뚫고 지나가지 않도록 상한을 둔다
export const BALL_RADIUS = 0.3; // 칸 기준 (셀의 30%)
export const TILT_FULL_DEG = 22; // 이 각도 이상 기울이면 최대 가속

/** 생성 스크립트가 만든 16진수 문자열을 칸 배열로 되돌린다. */
export function decodeMaze(maze, width, height) {
  const cells = [...maze.cells].map((ch) => parseInt(ch, 16));
  if (cells.length !== width * height) {
    throw new Error(`미로 크기가 맞지 않습니다: ${cells.length} != ${width * height}`);
  }
  return cells;
}

/** 기울기 각도(도) → -1~1 사이의 조작 세기. 미세한 손떨림은 무시한다. */
export function tiltToAxis(deg, deadzoneDeg = 2.5) {
  if (!Number.isFinite(deg)) return 0;
  const sign = Math.sign(deg);
  const magnitude = Math.abs(deg);
  if (magnitude <= deadzoneDeg) return 0;
  const t = (magnitude - deadzoneDeg) / (TILT_FULL_DEG - deadzoneDeg);
  return sign * Math.min(1, Math.max(0, t));
}

/**
 * 공을 한 프레임 움직인다. 좌표 단위는 "칸"이고 (0,0) 은 미로 왼쪽 위 모서리다.
 *
 * 축을 하나씩 나눠 움직이고 그때마다 벽에 밀어내는 방식(축 분리 충돌)을 쓴다.
 * 이렇게 해야 모서리에서 공이 끼거나 벽을 뚫고 나가지 않는다.
 *
 * @returns {{x:number,y:number,vx:number,vy:number}} 다음 상태
 */
export function stepBall({ x, y, vx, vy }, { ax, ay }, cells, width, height, dt) {
  // 1) 가속 + 저항
  let nvx = vx + ax * ACCEL * dt;
  let nvy = vy + ay * ACCEL * dt;
  const drag = Math.max(0, 1 - DAMPING * dt);
  nvx *= drag;
  nvy *= drag;

  const speed = Math.hypot(nvx, nvy);
  if (speed > MAX_SPEED) {
    nvx = (nvx / speed) * MAX_SPEED;
    nvy = (nvy / speed) * MAX_SPEED;
  }

  // 2) 한 프레임에 반 칸 넘게 움직이면 벽을 건너뛸 수 있으므로 잘게 나눠 민다
  const distance = Math.hypot(nvx * dt, nvy * dt);
  const steps = Math.max(1, Math.ceil(distance / 0.25));
  const sdt = dt / steps;

  let nx = x;
  let ny = y;
  for (let i = 0; i < steps; i += 1) {
    const moved = moveAxis(nx, ny, nvx * sdt, 0, cells, width, height);
    nx = moved.x;
    if (moved.hit) nvx = 0;

    const moved2 = moveAxis(nx, ny, 0, nvy * sdt, cells, width, height);
    ny = moved2.y;
    if (moved2.hit) nvy = 0;
  }

  return { x: nx, y: ny, vx: nvx, vy: nvy };
}

function wallAt(cells, width, height, cx, cy, dir) {
  if (cx < 0 || cx >= width || cy < 0 || cy >= height) return true; // 판 밖은 벽으로 친다
  return (cells[cy * width + cx] & dir) !== 0;
}

/** 한 축으로만 밀고, 벽에 닿으면 딱 붙여 세운다. */
function moveAxis(x, y, dx, dy, cells, width, height) {
  let nx = x + dx;
  let ny = y + dy;
  let hit = false;

  const cx = Math.floor(x);
  const cy = Math.floor(y);

  if (dx > 0) {
    const limit = cx + 1 - BALL_RADIUS;
    if (nx > limit && wallAt(cells, width, height, cx, cy, E)) { nx = limit; hit = true; }
  } else if (dx < 0) {
    const limit = cx + BALL_RADIUS;
    if (nx < limit && wallAt(cells, width, height, cx, cy, W)) { nx = limit; hit = true; }
  }

  if (dy > 0) {
    const limit = cy + 1 - BALL_RADIUS;
    if (ny > limit && wallAt(cells, width, height, cx, cy, S)) { ny = limit; hit = true; }
  } else if (dy < 0) {
    const limit = cy + BALL_RADIUS;
    if (ny < limit && wallAt(cells, width, height, cx, cy, N)) { ny = limit; hit = true; }
  }

  return { x: nx, y: ny, hit };
}

/** 도착 칸 한가운데에 충분히 가까우면 완주로 친다. */
export function reachedGoal({ x, y }, width, height) {
  const gx = width - 1 + 0.5;
  const gy = height - 1 + 0.5;
  return Math.hypot(x - gx, y - gy) < 0.34;
}
