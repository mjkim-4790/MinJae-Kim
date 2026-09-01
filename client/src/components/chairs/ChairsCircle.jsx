import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { chairAngle, playerAngle, polar, spinAngleAt } from '../../lib/chairs.js';

// 원 안쪽에 의자, 바깥쪽에 닉네임을 둔다 (현실에서 의자를 두고 그 바깥을 도는 모습).
const CHAIR_R = 0.62; // 반지름 대비 비율
const NAME_R = 0.9;

/**
 * 도는 원 — 대형화면이 쓴다.
 *
 * 회전은 서버가 준 시작 시각으로 매 프레임 계산한다. 각도를 서버가 계속 보내주는
 * 방식이면 초당 수십 번 브로드캐스트해야 하는데, 등속으로 도는 것뿐이라
 * 시작 시각만 알면 각 화면이 알아서 같은 위치를 그릴 수 있다.
 */
export default function ChairsCircle({ state, serverTime, highlightId }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState(0);
  const [angle, setAngle] = useState(0);
  const rafRef = useRef(null);

  const spinning = state.status === 'spinning';
  const frozen = state.freezeAngle;

  // 크기는 가로폭과 화면 높이로 정한다.
  // 부모의 clientHeight 로 재면 flex 로 남은 높이가 0 일 때 원이 통째로 접혀 사라진다
  // (실제로 그 버그가 났었다). 가로폭은 언제나 잡히므로 이쪽이 안전하다.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const update = () => {
      const byWidth = wrap.clientWidth;
      const byViewport = window.innerHeight * 0.52;
      setSize(Math.max(180, Math.min(byWidth, byViewport)));
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

  useEffect(() => {
    if (!spinning) {
      // 멈춘 뒤에는 서버가 알려준 각도에 딱 맞춘다 (모든 화면이 같은 그림이 되도록)
      if (frozen != null) setAngle(frozen);
      return undefined;
    }
    const tick = () => {
      setAngle(spinAngleAt(state.spinStartedAt, serverTime(), state.spinDegPerSec));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [spinning, frozen, state.spinStartedAt, state.spinDegPerSec, serverTime]);

  if (!size || state.players.length === 0) {
    return <div className="chairs-circle" ref={wrapRef} />;
  }

  const R = size / 2;
  const cx = R;
  const cy = R;
  const takenBy = new Map(state.taken.map((t) => [t.chairIndex, t]));
  const seated = new Set(state.taken.map((t) => t.participantId));
  const chairSize = Math.max(18, R * 0.16);
  const nameSize = Math.max(10, Math.min(20, R * 0.075));

  return (
    <div className="chairs-circle" ref={wrapRef}>
      <div className="chairs-circle__stage" style={{ width: size, height: size }}>
        <div className="chairs-circle__ring" style={{ inset: `${R * (1 - CHAIR_R) * 0.72}px` }} />

        {/* 의자 — 자리는 고정이고 앉으면 색이 찬다 */}
        {Array.from({ length: state.chairCount }, (_, i) => {
          const p = polar(chairAngle(i, state.chairCount), R * CHAIR_R, cx, cy);
          const sitter = takenBy.get(i);
          return (
            <div
              key={`chair-${i}`}
              className={`chairs-chair${sitter ? ' chairs-chair--taken' : ''}`}
              style={{
                left: p.x,
                top: p.y,
                width: chairSize,
                height: chairSize,
                fontSize: chairSize * 0.42,
              }}
              title={sitter ? sitter.nickname : `${i + 1}번 의자`}
            >
              {sitter ? '🪑' : i + 1}
            </div>
          );
        })}

        {/* 닉네임 — 이게 사람 대신 원을 돈다 */}
        {state.players.map((p) => {
          const a = playerAngle(p.angleIndex, state.players.length, angle);
          const pos = polar(a, R * NAME_R, cx, cy);
          const sat = seated.has(p.participantId);
          const isMe = highlightId != null && p.participantId === highlightId;
          return (
            <div
              key={p.participantId}
              className={`chairs-name${sat ? ' chairs-name--seated' : ''}${isMe ? ' chairs-name--me' : ''}`}
              style={{ left: pos.x, top: pos.y, fontSize: nameSize }}
            >
              {p.nickname}
            </div>
          );
        })}
      </div>
    </div>
  );
}
