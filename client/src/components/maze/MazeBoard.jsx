import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { BALL_RADIUS, decodeMaze, reachedGoal, stepBall, E, N, S, W } from '../../lib/maze.js';

const MAZE_W = 9; // server/src/game/mazes.js 와 맞춘 값
const MAZE_H = 13;

// 캔버스로 그린다. 미로 벽 + 공을 DOM 으로 만들면 요소가 수백 개라 매 프레임
// 갱신할 수 없다. 캔버스는 한 번에 다시 그리면 되고, 야바위와 달리 공이 자유롭게
// 움직여서 미리 만든 키프레임을 쓸 수도 없다.
export default function MazeBoard({
  maze,
  running,
  axisRef, // { current: { ax, ay } } — 기울기든 버튼이든 같은 모양으로 들어온다
  onGoal,
  ghostPos, // 결과 화면에서 공을 고정해 보여줄 때 (선택)
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ballRef = useRef({ x: 0.5, y: 0.5, vx: 0, vy: 0 });
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const goalHitRef = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // 매 렌더마다 새 배열을 만들면 아래 게임 루프 useEffect 가 계속 재시작된다
  const cells = useMemo(() => (maze ? decodeMaze(maze, MAZE_W, MAZE_H) : null), [maze]);

  // onGoal 을 그대로 의존성에 넣으면 부모가 인라인 함수를 줄 때마다 루프가 끊긴다
  const onGoalRef = useRef(onGoal);
  useEffect(() => {
    onGoalRef.current = onGoal;
  }, [onGoal]);

  // ghostPos 도 객체라 같은 문제가 있어 원시값으로 풀어 쓴다
  const ghostX = ghostPos?.x ?? null;
  const ghostY = ghostPos?.y ?? null;

  // 화면 폭에 맞춰 캔버스 크기를 정한다 (세로가 긴 미로라 높이를 먼저 본다)
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const availW = wrap.clientWidth;
      const cell = Math.max(12, Math.floor(availW / MAZE_W));
      setSize({ w: cell * MAZE_W, h: cell * MAZE_H });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  // 새 경기가 시작되면 공을 출발점으로 되돌린다
  useEffect(() => {
    ballRef.current = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
    goalHitRef.current = false;
  }, [maze]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cells || !size.w) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cell = size.w / MAZE_W;
    const css = getComputedStyle(canvas);
    const wallColor = css.getPropertyValue('--maze-wall').trim() || '#3d2317';
    const ballColor = css.getPropertyValue('--maze-ball').trim() || '#d84848';
    const goalColor = css.getPropertyValue('--maze-goal').trim() || '#48a848';

    const draw = () => {
      ctx.clearRect(0, 0, size.w, size.h);

      // 도착 칸
      ctx.fillStyle = goalColor;
      ctx.globalAlpha = 0.18;
      ctx.fillRect((MAZE_W - 1) * cell, (MAZE_H - 1) * cell, cell, cell);
      ctx.globalAlpha = 1;
      ctx.fillStyle = goalColor;
      ctx.font = `600 ${Math.round(cell * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('도착', (MAZE_W - 0.5) * cell, (MAZE_H - 0.5) * cell);

      // 벽
      ctx.strokeStyle = wallColor;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let y = 0; y < MAZE_H; y += 1) {
        for (let x = 0; x < MAZE_W; x += 1) {
          const c = cells[y * MAZE_W + x];
          const px = x * cell;
          const py = y * cell;
          if (c & N) { ctx.moveTo(px, py); ctx.lineTo(px + cell, py); }
          if (c & W) { ctx.moveTo(px, py); ctx.lineTo(px, py + cell); }
          // 남/동은 마지막 줄·칸에서만 그리면 된다 (나머지는 이웃의 북/서와 겹친다)
          if ((c & S) && y === MAZE_H - 1) { ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); }
          if ((c & E) && x === MAZE_W - 1) { ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); }
        }
      }
      ctx.stroke();

      // 공
      const b = ghostX != null ? { x: ghostX, y: ghostY } : ballRef.current;
      ctx.beginPath();
      ctx.arc(b.x * cell, b.y * cell, BALL_RADIUS * cell, 0, Math.PI * 2);
      ctx.fillStyle = ballColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    if (!running) {
      draw();
      return undefined;
    }

    lastRef.current = performance.now();
    const loop = (now) => {
      // 탭이 백그라운드에 갔다 오면 dt 가 몇 초씩 되므로 잘라낸다.
      // (물리는 큰 dt 도 견디지만, 그 사이 공이 순간이동한 것처럼 보이면 안 된다.)
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      const axis = axisRef?.current ?? { ax: 0, ay: 0 };
      ballRef.current = stepBall(ballRef.current, axis, cells, MAZE_W, MAZE_H, dt);

      if (!goalHitRef.current && reachedGoal(ballRef.current, MAZE_W, MAZE_H)) {
        goalHitRef.current = true;
        onGoalRef.current?.();
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cells, size, running, axisRef, ghostX, ghostY]);

  return (
    <div className="maze-board-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="maze-canvas"
        style={{ width: size.w, height: size.h }}
        aria-label="미로"
      />
    </div>
  );
}
