import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  BALL_RADIUS,
  NAME_LABEL_MAX,
  SPOTLIGHT_COUNT,
  decodeMaze,
  runnerColor,
  E,
  N,
  S,
  W,
} from '../../lib/maze.js';

const MAZE_W = 9;
const MAZE_H = 13;

// 서버는 초당 12번만 위치를 보낸다. 그대로 찍으면 공이 뚝뚝 끊겨 보이므로,
// 매 프레임 목표 위치 쪽으로 조금씩 따라붙게 해서 사이를 메운다.
// (정확한 보간보다 이 방식이 갱신 간격이 들쭉날쭉해도 튀지 않는다.)
const FOLLOW_PER_SEC = 14;

/**
 * 대형화면용 미로 — 모두가 같은 미로를 풀기 때문에 한 판에 전원의 공을 겹쳐 그린다.
 * 자기 물리를 돌리지 않고, 서버가 중계해준 위치만 따라 그리는 점이 MazeBoard 와 다르다.
 */
export default function MazeRaceBoard({ maze, runners, positions, height }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawnRef = useRef(new Map()); // participantId -> 화면에 실제로 찍고 있는 위치
  const targetRef = useRef(new Map()); // participantId -> 서버가 알려준 최신 위치
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const cells = useMemo(() => (maze ? decodeMaze(maze, MAZE_W, MAZE_H) : null), [maze]);

  const meta = useMemo(() => {
    const map = new Map();
    (runners ?? []).forEach((r) => map.set(r.participantId, r));
    return map;
  }, [runners]);

  // 최신 위치와 순위를 ref 에 담아둔다 (렌더를 다시 돌리지 않고 루프가 읽어간다)
  useEffect(() => {
    if (!positions?.runners) return;
    const next = new Map();
    positions.runners.forEach((r, i) => next.set(r.participantId, { ...r, order: i }));
    targetRef.current = next;
  }, [positions]);

  // 새 판이 시작되면 잔상을 지운다
  useEffect(() => {
    drawnRef.current = new Map();
    targetRef.current = new Map();
  }, [maze]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const availH = height ?? wrap.clientHeight;
      const availW = wrap.clientWidth;
      // 세로가 긴 미로라 높이를 먼저 맞추고, 넘치면 폭에 맞춘다
      const cell = Math.max(10, Math.floor(Math.min(availH / MAZE_H, availW / MAZE_W)));
      setSize({ w: cell * MAZE_W, h: cell * MAZE_H });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [height]);

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
    const goalColor = css.getPropertyValue('--maze-goal').trim() || '#48a848';
    const showNames = (runners?.length ?? 0) <= NAME_LABEL_MAX;

    const drawMaze = () => {
      ctx.clearRect(0, 0, size.w, size.h);

      ctx.fillStyle = goalColor;
      ctx.globalAlpha = 0.18;
      ctx.fillRect((MAZE_W - 1) * cell, (MAZE_H - 1) * cell, cell, cell);
      ctx.globalAlpha = 1;
      ctx.fillStyle = goalColor;
      ctx.font = `600 ${Math.round(cell * 0.36)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('도착', (MAZE_W - 0.5) * cell, (MAZE_H - 0.5) * cell);

      ctx.strokeStyle = wallColor;
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let y = 0; y < MAZE_H; y += 1) {
        for (let x = 0; x < MAZE_W; x += 1) {
          const c = cells[y * MAZE_W + x];
          const px = x * cell;
          const py = y * cell;
          if (c & N) { ctx.moveTo(px, py); ctx.lineTo(px + cell, py); }
          if (c & W) { ctx.moveTo(px, py); ctx.lineTo(px, py + cell); }
          if ((c & S) && y === MAZE_H - 1) { ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); }
          if ((c & E) && x === MAZE_W - 1) { ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); }
        }
      }
      ctx.stroke();
    };

    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      // 목표 위치 쪽으로 조금씩 따라붙는다
      const follow = Math.min(1, dt * FOLLOW_PER_SEC);
      const drawn = drawnRef.current;
      targetRef.current.forEach((t, id) => {
        const cur = drawn.get(id);
        if (!cur) { drawn.set(id, { x: t.x, y: t.y }); return; }
        // '상' 난이도에서 벽에 닿아 출발점으로 되돌아간 경우처럼 한 번에 멀리 뛰면,
        // 사이를 이어 그리면 미로를 가로질러 미끄러지는 이상한 그림이 된다. 그냥 튄다.
        if (Math.hypot(t.x - cur.x, t.y - cur.y) > 2) { drawn.set(id, { x: t.x, y: t.y }); return; }
        drawn.set(id, { x: cur.x + (t.x - cur.x) * follow, y: cur.y + (t.y - cur.y) * follow });
      });

      drawMaze();

      // 뒤처진 사람부터 그려서 선두가 위에 오게 한다
      const ordered = [...targetRef.current.values()].sort((a, b) => b.order - a.order);
      ordered.forEach((t) => {
        const p = drawn.get(t.participantId);
        if (!p) return;
        const info = meta.get(t.participantId);
        const color = runnerColor(info?.colorIndex ?? 0);
        const lead = t.order < SPOTLIGHT_COUNT;

        // 선두는 크고 선명하게, 나머지는 작고 흐리게 (사용자 선택)
        ctx.globalAlpha = lead ? 1 : 0.28;
        const r = BALL_RADIUS * cell * (lead ? 1 : 0.62);

        ctx.beginPath();
        ctx.arc(p.x * cell, p.y * cell, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (lead) {
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.stroke();
        }

        // 완주한 사람은 테두리를 한 겹 더 둘러 표시한다
        if (t.finishedMs != null) {
          ctx.beginPath();
          ctx.arc(p.x * cell, p.y * cell, r * 1.7, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          ctx.strokeStyle = color;
          ctx.stroke();
        }

        if (showNames && info?.nickname) {
          ctx.globalAlpha = lead ? 1 : 0.4;
          ctx.font = `700 ${Math.round(cell * 0.3)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.lineWidth = Math.max(2, cell * 0.08);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeText(info.nickname, p.x * cell, p.y * cell - r - 2);
          ctx.fillStyle = color;
          ctx.fillText(info.nickname, p.x * cell, p.y * cell - r - 2);
        }
        ctx.globalAlpha = 1;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cells, size, meta, runners]);

  return (
    <div className="maze-race-board" ref={wrapRef}>
      <canvas ref={canvasRef} className="maze-canvas" style={{ width: size.w, height: size.h }} aria-label="미로 경기" />
    </div>
  );
}
