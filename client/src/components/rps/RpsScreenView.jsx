import { useEffect, useState } from 'react';

import { HandIcon } from './HandIcons.jsx';
import { CHOICES } from '../../lib/rps.js';

function useCountdown(timerEndsAt) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!timerEndsAt) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timerEndsAt]);
  return remaining;
}

/** 대형 스크린의 가위바위보 연출. status==='idle' 이면 아무것도 렌더링하지 않는다 (로고/QR 모드 유지). */
export default function RpsScreenView({ state }) {
  const remaining = useCountdown(state.timerEndsAt);

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">최종 승자</p>
        <p className="screen__rps-emoji">🏆</p>
        <p className="screen__rps-list">{state.finalWinners?.map((w) => w.nickname).join(' · ')}</p>
      </div>
    );
  }

  if (state.status === 'result' && state.roundResult) {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">MC 의 선택</p>
        <HandIcon choice={state.operatorChoice} size={140} />
        <p className="screen__rps-list">
          생존 {state.roundResult.winners.length}명 · 탈락 {state.roundResult.nonWinners.length}명
        </p>
        <p className="screen__rps-list">{state.roundResult.winners.map((w) => w.nickname).join(', ') || '—'}</p>
      </div>
    );
  }

  if (state.status === 'locked') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">라운드 {state.round}</p>
        <p className="screen__rps-emoji">🤔</p>
        <p className="screen__rps-list">두구두구… MC 가 선택 중입니다</p>
      </div>
    );
  }

  // selecting
  return (
    <div className="screen__center">
      <p className="screen__eyebrow">라운드 {state.round} · 목표 {state.targetWinners}명</p>
      <div className="rps-choice-row" style={{ justifyContent: 'center' }}>
        {CHOICES.map((c) => (
          <HandIcon key={c} choice={c} size={72} />
        ))}
      </div>
      <p className="screen__rps-list">
        선택 완료 {state.chosenParticipantIds.length}/{state.activeParticipantIds.length}
      </p>
      {remaining !== null && <p className="screen__code" style={{ fontSize: 'clamp(48px,8vw,120px)' }}>{remaining}</p>}
    </div>
  );
}
