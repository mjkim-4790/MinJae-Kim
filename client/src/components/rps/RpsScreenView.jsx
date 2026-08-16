import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { ChoiceEmoji } from './ChoiceEmoji.jsx';
import { springPop } from '../../lib/motionPresets.js';
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

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

/** 대형 스크린의 가위바위보 연출. status==='idle' 이면 아무것도 렌더링하지 않는다 (로고/QR 모드 유지). */
export default function RpsScreenView({ state }) {
  const remaining = useCountdown(state.timerEndsAt);

  if (state.status === 'idle') return null;

  return (
    <AnimatePresence mode="wait">
      {state.status === 'ended' && (
        <motion.div
          key="ended"
          className="screen__center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={screenPop}
        >
          <p className="screen__eyebrow">최종 승자</p>
          <p className="screen__rps-emoji">🏆</p>
          <p className="screen__rps-list">{state.finalWinners?.map((w) => w.nickname).join(' · ')}</p>
        </motion.div>
      )}

      {state.status === 'result' && state.roundResult && (
        <motion.div
          key="result"
          className="screen__center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={screenPop}
        >
          <p className="screen__eyebrow">MC 의 선택</p>
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...screenPop, delay: 0.08 }}
          >
            <ChoiceEmoji choice={state.operatorChoice} size={140} />
          </motion.div>
          <p className="screen__rps-list">
            생존 {state.roundResult.winners.length}명 · 탈락 {state.roundResult.nonWinners.length}명
          </p>
          <p className="screen__rps-list">{state.roundResult.winners.map((w) => w.nickname).join(', ') || '—'}</p>
        </motion.div>
      )}

      {state.status === 'locked' && (
        <motion.div
          key="locked"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">라운드 {state.round}</p>
          <p className="screen__rps-emoji">🤔</p>
          <p className="screen__rps-list">두구두구… MC 가 선택 중입니다</p>
        </motion.div>
      )}

      {state.status === 'selecting' && (
        <motion.div
          key="selecting"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">라운드 {state.round} · 목표 {state.targetWinners}명</p>
          <div className="rps-choice-row" style={{ justifyContent: 'center' }}>
            {CHOICES.map((c) => (
              <ChoiceEmoji key={c} choice={c} size={72} />
            ))}
          </div>
          <p className="screen__rps-list">
            선택 완료 {state.chosenParticipantIds.length}/{state.activeParticipantIds.length}
          </p>
          {remaining !== null && (
            <motion.p
              key={remaining}
              className="screen__code"
              style={{ fontSize: 'clamp(48px,8vw,120px)' }}
              initial={{ opacity: 0.4, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
            >
              {remaining}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
