import { useEffect, useRef } from 'react';

import { BONES } from '../../lib/silhouette.js';

/**
 * 따라 할 실루엣과, 그 위에 겹쳐지는 참가자의 뼈대를 함께 그린다.
 *
 * 카메라 영상은 띄우지 않는다 — 줄 선 사람들이 다 같이 보는 화면이라 얼굴이 걸리는
 * 그림을 만들지 않는다. 대신 **목표 모양(굵은 회색) 위에 내 뼈대(파란 선)** 를 겹쳐
 * 보여주면, 어디를 더 올리고 내려야 하는지가 영상보다 오히려 잘 보인다.
 */
export default function PoseStage({ pose, pointsRef, holding }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const holdingRef = useRef(holding);
  holdingRef.current = holding;

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

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const unit = canvas.width / 100;
      // 목표 실루엣 — 굵고 연하게 (따라 그릴 밑그림)
      drawFigure(pose?.points, { color: 'rgba(61, 35, 23, 0.18)', width: unit * 6, mirror: false });
      // 내 뼈대 — 맞으면 초록, 아니면 파랑. 카메라는 거울처럼 좌우를 뒤집어 보여준다.
      drawFigure(pointsRef.current, {
        color: holdingRef.current ? '#1f9e4d' : '#0a84ff',
        width: unit * 1.6,
        dot: true,
        mirror: true,
      });
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
