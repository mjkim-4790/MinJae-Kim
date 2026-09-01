// 의자 빨리 뺏기 — 화면이 쓰는 기하 계산.
//
// server/src/game/chairsEngine.js 와 같은 규칙이어야 한다. 어긋나면 화면에 보이는
// 의자 버튼을 눌렀는데 서버가 "너무 멀다"며 거부하는 일이 생긴다.
// (테스트에서 두 구현을 모든 각도로 맞춰본다.)

export const SPIN_DEG_PER_SEC = 60;

const norm = (deg) => ((deg % 360) + 360) % 360;

export function chairAngle(index, chairCount) {
  return norm((index / chairCount) * 360);
}

export function playerAngle(index, playerCount, freezeAngle) {
  return norm((index / playerCount) * 360 + freezeAngle);
}

/** 이 각도에 선 사람이 잡을 수 있는 의자들. 의자가 하나뿐이면 모두가 그 하나를 노린다. */
export function allowedChairs(angle, chairCount) {
  if (chairCount <= 1) return [0];
  const step = 360 / chairCount;
  const lower = Math.floor(norm(angle) / step) % chairCount;
  const upper = (lower + 1) % chairCount;
  return lower === upper ? [lower] : [lower, upper].sort((a, b) => a - b);
}

/** 원 위의 각도를 화면 좌표로. 12시 방향에서 시작해 시계방향으로 돈다. */
export function polar(angleDeg, radius, cx = 0, cy = 0) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

/** 아직 도는 중일 때의 회전 각도 (서버가 준 시작 시각 기준). */
export function spinAngleAt(spinStartedAt, nowMs, degPerSec = SPIN_DEG_PER_SEC) {
  if (!spinStartedAt) return 0;
  return norm(((nowMs - spinStartedAt) / 1000) * degPerSec);
}
