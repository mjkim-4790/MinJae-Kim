import { useEffect, useRef } from 'react';

import { HAND_CONNECTIONS } from '../../lib/laterps.js';

/**
 * 카메라가 보고 있는 손을 뼈대로만 그린다.
 *
 * 영상을 그대로 띄우지 않는 이유: 이 화면은 줄 선 사람들이 다 같이 보는 큰 화면이고,
 * 아이가 섞일 수 있다. 얼굴이 걸리는 그림을 아예 만들지 않으려고 인식된 손 21점만
 * 남긴다. 손이 잡히는지 아닌지는 뼈대가 뜨는 것만으로 충분히 알 수 있다.
 */
export default function HandStage({ landmarksRef, hint }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const rafRef = useRef(null);

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
    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      const lm = landmarksRef.current;
      if (lm && lm.length) {
        // 카메라가 거울처럼 보이도록 좌우를 뒤집는다. 안 뒤집으면 오른손을 들었는데
        // 화면에서는 왼쪽으로 가서 사람들이 헷갈린다.
        const px = (p) => (1 - p.x) * w;
        const py = (p) => p.y * h;

        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = Math.max(3, w * 0.008);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          if (!lm[a] || !lm[b]) continue;
          ctx.moveTo(px(lm[a]), py(lm[a]));
          ctx.lineTo(px(lm[b]), py(lm[b]));
        }
        ctx.stroke();

        ctx.fillStyle = '#211f1c';
        const r = Math.max(3, w * 0.009);
        for (const p of lm) {
          ctx.beginPath();
          ctx.arc(px(p), py(p), r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      obs.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [landmarksRef]);

  return (
    <div className="lr-handstage" ref={wrapRef}>
      <canvas ref={canvasRef} className="lr-handstage__canvas" aria-label="인식된 손" />
      {hint && <p className="lr-handstage__hint">{hint}</p>}
    </div>
  );
}
