import { useEffect, useRef } from 'react';

import { BONES } from '../../lib/silhouette.js';

/**
 * 따라 할 실루엣과, 그 위에 겹쳐지는 참가자의 뼈대를 함께 그린다.
 *
 * 카메라 영상은 띄우지 않는다 — 줄 선 사람들이 다 같이 보는 화면이라 얼굴이 걸리는
 * 그림을 만들지 않는다. 대신 **목표 모양(굵은 회색) 위에 내 뼈대(파란 선)** 를 겹쳐
 * 보여주면, 어디를 더 올리고 내려야 하는지가 영상보다 오히려 잘 보인다.
 */
export default function PoseStage({ pose, pointsRef, holding, wall = null }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  // 벽은 매 프레임 다시 그려야 해서 ref 로 넘긴다 (state 로 두면 초당 60번 다시 그린다)
  const wallRef = useRef(wall);
  wallRef.current = wall;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(wrap);

    const ctx = canvas.getContext('2d');

    const drawFigure = (pts, { color, width, dot, mirror }) => {
      if (!pts) return;
      const w = canvas.width;
      const h = canvas.height;
      const px = (p) => (mirror ? 1 - p.x : p.x) * w;
      const py = (p) => p.y * h;

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const [a, b] of BONES) {
        if (!pts[a] || !pts[b]) continue;
        ctx.moveTo(px(pts[a]), py(pts[a]));
        ctx.lineTo(px(pts[b]), py(pts[b]));
      }
      ctx.stroke();

      // 머리 — 어깨 중점 위에 얹는다. 사람 모양으로 보이려면 이게 있어야 한다.
      if (pts.shoulderL && pts.shoulderR) {
        const cx = (px(pts.shoulderL) + px(pts.shoulderR)) / 2;
        const cy = (py(pts.shoulderL) + py(pts.shoulderR)) / 2;
        const span = Math.abs(px(pts.shoulderL) - px(pts.shoulderR));
        const r = Math.max(8, span * 0.45);
        ctx.beginPath();
        ctx.arc(cx, cy - r * 1.5, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (dot) {
        ctx.fillStyle = color;
        for (const p of Object.values(pts)) {
          ctx.beginPath();
          ctx.arc(px(p), py(p), width * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    /**
     * 다가오는 벽.
     *
     * 멀리 있을 때는 작게, 닿을수록 화면을 가득 채운다 — 일본 예능의 그 연출이다.
     * 사람 모양으로 구멍을 뚫어야 "저 구멍에 몸을 맞춘다"가 한눈에 보이므로,
     * 벽을 칠한 뒤 구멍을 destination-out 으로 도려낸다.
     */
    const drawWall = (progress) => {
      const w = canvas.width;
      const h = canvas.height;
      // 멀리 있는 벽은 화면 가운데에 작게 — 0.18 에서 1 로 커진다
      const k = 0.18 + 0.82 * progress;
      const ww = w * k;
      const wh = h * k;
      const ox = (w - ww) / 2;
      const oy = (h - wh) / 2;

      ctx.save();
      // 가까워질수록 진해진다 (거리감)
      ctx.globalAlpha = 0.25 + 0.55 * progress;
      ctx.fillStyle = '#3d2317';
      ctx.fillRect(ox, oy, ww, wh);

      // 사람 모양 구멍
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(6, ww * 0.11);
      const pts = pose?.points;
      if (pts) {
        const px = (p) => ox + p.x * ww;
        const py = (p) => oy + p.y * wh;
        ctx.beginPath();
        for (const [a, b] of BONES) {
          if (!pts[a] || !pts[b]) continue;
          ctx.moveTo(px(pts[a]), py(pts[a]));
          ctx.lineTo(px(pts[b]), py(pts[b]));
        }
        ctx.stroke();
        if (pts.shoulderL && pts.shoulderR) {
          const cx = (px(pts.shoulderL) + px(pts.shoulderR)) / 2;
          const cy = (py(pts.shoulderL) + py(pts.shoulderR)) / 2;
          const span = Math.abs(px(pts.shoulderL) - px(pts.shoulderR));
          const r = Math.max(6, span * 0.62);
          ctx.beginPath();
          ctx.arc(cx, cy - r * 1.35, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 벽 테두리 — 구멍을 도려낸 뒤에 그려야 같이 지워지지 않는다
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.5 * progress;
      ctx.strokeStyle = '#3d2317';
      ctx.lineWidth = Math.max(2, ww * 0.012);
      ctx.strokeRect(ox, oy, ww, wh);
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const unit = canvas.width / 100;
      const wallNow = wallRef.current;
      // 목표 실루엣 — 굵고 연하게 (따라 그릴 밑그림).
      // 벽 모드에서는 벽 자체가 모양을 보여주므로 밑그림을 더 연하게 깐다.
      drawFigure(pose?.points, {
        color: wallNow ? 'rgba(61, 35, 23, 0.08)' : 'rgba(61, 35, 23, 0.18)',
        width: unit * 6,
        mirror: false,
      });
      // 내 뼈대 — 맞으면 초록, 아니면 파랑. 카메라는 거울처럼 좌우를 뒤집어 보여준다.
      drawFigure(pointsRef.current, {
        color: holdingRef.current ? '#1f9e4d' : '#0a84ff',
        width: unit * 1.6,
        dot: true,
        mirror: true,
      });

      // 벽은 맨 위에 — 내 몸 위로 덮쳐 와야 다가오는 느낌이 난다
      if (wallNow) {
        const total = Math.max(1, wallNow.hitsAt - wallNow.startedAt);
        const left = wallNow.hitsAt - Date.now();
        drawWall(Math.min(1, Math.max(0, 1 - left / total)));
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      obs.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pose, pointsRef]);

  return (
    <div className="sil-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="sil-stage__canvas" aria-label="따라 할 자세" />
    </div>
  );
}
