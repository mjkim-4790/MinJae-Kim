import { useEffect, useRef, useState } from 'react';

import { DOLL_CHASE_DELAY_MS, POSITION_SEND_MS } from '../../lib/mugunghwa.js';

/**
 * 도망 구간에서 영희가 쫓아가는 조작.
 *
 * 참가자가 영희일 때(폰)와 진행자가 영희일 때(노트북) 같은 화면을 쓴다.
 * 노트북에는 큰 버튼을 연타하기 어려우니 스페이스바로도 달릴 수 있게 했다.
 *
 * 두드림은 모아서 12Hz 로 보낸다 — 누를 때마다 소켓을 쏘면 연타가 곧 폭주가 된다.
 */
export default function DollChase({ game }) {
  const { state, chase, serverTime } = game;
  const tapsRef = useRef(0);
  const [taps, setTaps] = useState(0);
  const [, tick] = useState(0);

  // 모아 보내기
  useEffect(() => {
    if (state.status !== 'sprinting') return undefined;
    const id = setInterval(() => {
      const n = tapsRef.current;
      tapsRef.current = 0;
      if (n > 0) chase(n);
    }, POSITION_SEND_MS);
    return () => clearInterval(id);
  }, [state.status, chase]);

  // 남은 시간·대기 시간을 보여주려고 자주 다시 그린다
  useEffect(() => {
    if (state.status !== 'sprinting') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  const bump = () => {
    tapsRef.current += 1;
    setTaps((n) => n + 1);
  };

  // 노트북용 — 스페이스바로도 달린다
  useEffect(() => {
    if (state.status !== 'sprinting') return undefined;
    const onKey = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault(); // 스페이스로 화면이 스크롤되지 않게
      bump();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status]);

  // 새 라운드가 시작되면 센 횟수를 지운다
  useEffect(() => {
    if (state.status !== 'sprinting') {
      tapsRef.current = 0;
      setTaps(0);
    }
  }, [state.status, state.round]);

  if (state.status !== 'sprinting') return null;

  const elapsed = state.sprintStartedAt ? serverTime() - state.sprintStartedAt : 0;
  const waitLeft = Math.max(0, DOLL_CHASE_DELAY_MS - elapsed);
  const msLeft = state.sprintEndsAt ? Math.max(0, state.sprintEndsAt - serverTime()) : 0;

  return (
    <>
      <p className="mg-light mg-light--red">
        {waitLeft > 0
          ? `몸을 돌리는 중… ${(waitLeft / 1000).toFixed(1)}`
          : `쫓아가세요! ${(msLeft / 1000).toFixed(1)}초`}
      </p>

      <button
        type="button"
        className="mg-tap mg-tap--doll"
        disabled={waitLeft > 0}
        onPointerDown={(e) => {
          e.preventDefault();
          bump();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {waitLeft > 0 ? '잠깐 기다리세요' : '빨리 두드려 잡기!'}
      </button>

      <p className="subtitle">
        지나친 사람은 모두 잡힙니다 · 두드린 횟수 {taps}회
        {state.dollCatchCount > 0 && ` · 잡은 사람 ${state.dollCatchCount}명`}
        <br />
        노트북이면 <strong>스페이스바</strong>로도 달릴 수 있어요.
      </p>
    </>
  );
}
