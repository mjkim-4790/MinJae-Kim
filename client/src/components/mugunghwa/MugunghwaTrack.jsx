import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { NAME_LABEL_MAX, runnerColor } from '../../lib/mugunghwa.js';

// 서버는 초당 12번만 위치를 보낸다. 그대로 찍으면 뚝뚝 끊기므로 매 프레임 목표 쪽으로
// 조금씩 따라붙게 해서 사이를 메운다 (미로 대형화면과 같은 방식).
const FOLLOW_PER_SEC = 14;

/**
 * 사람 모양을 그린다.
 *
 * 이모지를 쓰지 않는 이유: 기기마다 그림이 달라 프로젝터에 물린 PC 에서 네모로 뜰 수
 * 있고, 무엇보다 "걷다가 얼어붙는" 동작을 표현할 수 없다. 이 게임은 그 대비가 전부라
 * 직접 그린다.
 *
 * @param phase 걷는 동작의 위상 (멈춰 있으면 다리를 모은다)
 */
function drawRunner(ctx, x, y, h, color, { moving, phase, caught, home, facingLeft }) {
  const head = h * 0.22;
  const bodyTop = y - h + head * 2;
  const bodyBottom = y - h * 0.38;

  ctx.save();
  ctx.translate(x, 0);
  if (facingLeft) ctx.scale(-1, 1); // 돌아서서 달릴 때는 좌우를 뒤집는다

  if (caught) {
    // 잡힌 사람은 쓰러뜨려서 한눈에 구분되게 한다
    ctx.translate(0, y);
    ctx.rotate(-Math.PI / 2.2);
    ctx.translate(0, -y);
    ctx.globalAlpha = 0.45;
  } else if (home) {
    ctx.globalAlpha = 0.9;
  }

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.09);
  ctx.lineCap = 'round';

  // 머리
  ctx.beginPath();
  ctx.arc(0, y - h + head, head, 0, Math.PI * 2);
  ctx.fill();

  // 몸통
  ctx.beginPath();
  ctx.moveTo(0, bodyTop);
  ctx.lineTo(0, bodyBottom);
  ctx.stroke();

  // 팔·다리 — 움직일 때만 앞뒤로 흔든다
  const swing = moving ? Math.sin(phase) * h * 0.22 : 0;
  const stand = moving ? 0 : h * 0.06;

  ctx.beginPath();
  ctx.moveTo(0, bodyTop + h * 0.12);
  ctx.lineTo(swing, bodyTop + h * 0.3);
  ctx.moveTo(0, bodyTop + h * 0.12);
  ctx.lineTo(-swing, bodyTop + h * 0.3);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, bodyBottom);
  ctx.lineTo(swing + stand, y);
  ctx.moveTo(0, bodyBottom);
  ctx.lineTo(-swing - stand, y);
  ctx.stroke();

  ctx.restore();
}

/** 영희 — 등을 돌리면 뒤통수, 돌아보면 눈이 보인다. */
function drawDoll(ctx, x, y, h, green) {
  const head = h * 0.3;
  const cx = x;
  const cy = y - h + head;

  ctx.save();
  // 몸통(치마)
  ctx.fillStyle = green ? '#c9971f' : '#d84848';
  ctx.beginPath();
  ctx.moveTo(cx, cy + head * 0.6);
  ctx.lineTo(cx - h * 0.28, y);
  ctx.lineTo(cx + h * 0.28, y);
  ctx.closePath();
  ctx.fill();

  // 머리
  ctx.fillStyle = '#f0d5b8';
  ctx.beginPath();
  ctx.arc(cx, cy, head, 0, Math.PI * 2);
  ctx.fill();

  // 머리카락 — 등을 돌렸을 때는 뒤통수를 덮는다
  ctx.fillStyle = '#2c2118';
  ctx.beginPath();
  if (green) {
    ctx.arc(cx, cy, head, 0, Math.PI * 2); // 뒤통수: 머리 전체가 검다
    ctx.fill();
  } else {
    ctx.arc(cx, cy, head, Math.PI, Math.PI * 2); // 앞머리
    ctx.fill();
    // 눈 — 돌아본 순간에만 보인다
    ctx.fillStyle = '#2c2118';
    ctx.beginPath();
    ctx.arc(cx - head * 0.35, cy + head * 0.1, head * 0.13, 0, Math.PI * 2);
    ctx.arc(cx + head * 0.35, cy + head * 0.1, head * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 대형화면 트랙. 왼쪽이 출발선, 오른쪽이 영희다.
 * 1단계에는 오른쪽으로 다가가고, 2단계에는 몸을 돌려 왼쪽으로 되돌아간다.
 */
export default function MugunghwaTrack({ state, positions }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawnRef = useRef(new Map());
  const targetRef = useRef(new Map());
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const phaseRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const meta = useMemo(() => {
    const m = new Map();
    (state.runners ?? []).forEach((r) => m.set(r.participantId, r));
    return m;
  }, [state.runners]);

  useEffect(() => {
    if (!positions?.runners) return;
    const next = new Map();
    positions.runners.forEach((r) => next.set(r.participantId, r));
    targetRef.current = next;
  }, [positions]);

  // 새 라운드가 시작되면 잔상을 지운다
  useEffect(() => {
    drawnRef.current = new Map();
    targetRef.current = new Map();
  }, [state.round]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const w = wrap.clientWidth;
      // 높이는 화면 기준으로 잡는다 — flex 로 남은 높이에 기대면 0 이 되어 사라진다
      // (의자 게임에서 겪은 문제)
      const h = Math.max(200, Math.min(w * 0.42, window.innerHeight * 0.5));
      setSize({ w, h });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(wrap);
    window.addEventListener('resize', update);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const green = state.green;
  const sprinting = state.status === 'sprinting';
  const running = state.status === 'approaching' || state.status === 'sprinting';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = getComputedStyle(canvas);
    const line = css.getPropertyValue('--mg-line').trim() || '#3d2317';
    const showNames = (state.runners?.length ?? 0) <= NAME_LABEL_MAX;

    const marginX = size.w * 0.09;
    const startX = marginX;
    const dollX = size.w - marginX;

    // 주자를 세로로 나눠 세운다. 다들 같은 자리에서 출발해서 한 줄에 그리면
    // 사람도 이름도 겹쳐 읽을 수가 없다 (실제로 그렇게 나왔다).
    const runnerCount = Math.max(1, state.runners?.length ?? 1);
    const laneCount = Math.min(8, runnerCount);
    const bandTop = size.h * 0.3;
    const bandBottom = size.h * 0.84;
    const laneGap = laneCount > 1 ? (bandBottom - bandTop) / (laneCount - 1) : 0;
    const laneY = (i) => bandBottom - (i % laneCount) * laneGap;
    const groundY = bandBottom;
    // 레인 간격보다 크면 위아래가 겹치므로 그 안에 들어오게 잡는다
    const figureH = Math.max(18, Math.min(size.h * 0.2, laneGap > 0 ? laneGap * 0.9 : size.h * 0.2));

    const draw = () => {
      ctx.clearRect(0, 0, size.w, size.h);

      // 레인 — 주자마다 한 줄씩
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < laneCount; i += 1) {
        const y = laneY(i);
        ctx.beginPath();
        ctx.moveTo(startX - size.w * 0.02, y);
        ctx.lineTo(dollX, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 출발선(= 돌아올 결승선)
      ctx.strokeStyle = '#48a848';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(startX, bandTop - size.h * 0.06);
      ctx.lineTo(startX, bandBottom + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#48a848';
      ctx.font = `700 ${Math.round(size.h * 0.075)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('출발선', startX, bandBottom + size.h * 0.11);

      // 영희 — 레인 한가운데 서 있다
      const dollY = (bandTop + bandBottom) / 2 + size.h * 0.06;
      drawDoll(ctx, dollX, dollY, Math.min(size.h * 0.34, (bandBottom - bandTop) * 0.7 + size.h * 0.1), green);
      ctx.fillStyle = green ? '#c9971f' : '#d84848';
      ctx.font = `700 ${Math.round(size.h * 0.075)}px system-ui, sans-serif`;
      ctx.fillText(state.doll?.nickname ?? '영희', dollX, bandBottom + size.h * 0.11);

      // 주자들
      const drawn = drawnRef.current;
      targetRef.current.forEach((t) => {
        const p = drawn.get(t.participantId);
        if (!p) return;
        const info = meta.get(t.participantId);
        const color = runnerColor(info?.colorIndex ?? 0);
        const x = startX + (dollX - startX) * p.pos;
        const y = laneY(info?.colorIndex ?? 0);
        const moving = running && !t.caught && !t.home && p.moving;

        drawRunner(ctx, x, y, figureH, color, {
          moving,
          phase: phaseRef.current,
          caught: t.caught,
          home: t.home,
          facingLeft: sprinting,
        });

        if (showNames && info?.nickname) {
          ctx.globalAlpha = t.caught ? 0.5 : 1;
          ctx.font = `700 ${Math.round(Math.min(size.h * 0.055, figureH * 0.6))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = Math.max(2, size.h * 0.012);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeText(info.nickname, x, y - figureH - 2);
          ctx.fillStyle = color;
          ctx.fillText(info.nickname, x, y - figureH - 2);
          ctx.globalAlpha = 1;
        }
      });
    };

    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      phaseRef.current += dt * 11; // 다리 흔드는 속도

      const follow = Math.min(1, dt * FOLLOW_PER_SEC);
      const drawn = drawnRef.current;
      targetRef.current.forEach((t, id) => {
        const cur = drawn.get(id);
        if (!cur) {
          drawn.set(id, { pos: t.pos, moving: false });
          return;
        }
        const delta = t.pos - cur.pos;
        drawn.set(id, {
          pos: cur.pos + delta * follow,
          // 실제로 자리가 바뀌고 있을 때만 다리를 움직인다
          moving: Math.abs(delta) > 0.002,
        });
      });

      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [size, meta, green, sprinting, running, state.runners, state.doll]);

  return (
    <div className="mg-track" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="mg-canvas"
        style={{ width: size.w, height: size.h }}
        aria-label="무궁화꽃이 피었습니다 트랙"
      />
    </div>
  );
}
