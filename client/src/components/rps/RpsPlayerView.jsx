import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import HourglassAnimation from './HourglassAnimation.jsx';
import { HandIcon } from './HandIcons.jsx';
import { springPop, springTap } from '../../lib/motionPresets.js';
import { CHOICE_META, CHOICES } from '../../lib/rps.js';

function TimerBadge({ timerEndsAt }) {
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

  if (remaining === null) return null;
  return <span className="badge badge--info">⏳ {remaining}초</span>;
}

function branchMessage(outcome, won) {
  if (won) return outcome === 'ended' ? '목표 달성! 최종 생존했습니다 🎉' : '생존했습니다! 다음 라운드로';
  return outcome === 'ended' || outcome === 'overshoot'
    ? '탈락했습니다'
    : '탈락 — 패자부활전에서 다시 도전합니다';
}

function RoundResult({ state, participantId }) {
  const outcome = state.roundResult.branchOutcome;
  if (outcome === 'wipeout') {
    return (
      <div className="rps-spectator">전멸! 이 라운드는 무효 처리되어 같은 인원으로 다시 대결합니다.</div>
    );
  }

  const won = state.roundResult.winners.some((w) => w.id === participantId);
  const wasInRound = won || state.roundResult.nonWinners.some((w) => w.id === participantId);
  if (!wasInRound) return null;

  return (
    <div className={`rps-result-line ${won ? 'rps-result-line--win' : 'rps-result-line--lose'}`}>
      <span className="rps-inline">
        MC: <HandIcon choice={state.operatorChoice} size={22} />
      </span>
      {' · '}
      {branchMessage(outcome, won)}
    </div>
  );
}

/** 참여자 화면의 가위바위보 게임 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function RpsPlayerView({ game, participantId }) {
  const { state, yourChoice, choose } = game;

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    const isFinalWinner = state.finalWinners?.some((w) => w.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">가위바위보 서바이벌 — 종료</h2>
        {isFinalWinner ? (
          <motion.p
            className="rps-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 최종 승자입니다!
          </motion.p>
        ) : (
          <p className="rps-spectator">
            게임이 종료됐습니다. 최종 승자: {state.finalWinners?.map((w) => w.nickname).join(', ')}
          </p>
        )}
      </section>
    );
  }

  const inRound = state.activeParticipantIds.includes(participantId);
  const isConfirmedWinner = state.confirmedWinnerIds.includes(participantId);

  return (
    <section className="panel stack">
      <h2 className="panel__title">가위바위보 서바이벌 — 라운드 {state.round}</h2>

      {state.status === 'selecting' && state.timerEndsAt && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <TimerBadge timerEndsAt={state.timerEndsAt} />
          {state.timerDecorative && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springPop}
            >
              <HourglassAnimation size={48} />
            </motion.div>
          )}
        </div>
      )}

      {!inRound && (
        <p className="rps-spectator">
          {isConfirmedWinner
            ? '다음 라운드 진출이 확정됐습니다. 잠시만 기다려주세요.'
            : '이번 게임에서 탈락했습니다. 계속 지켜봐주세요.'}
        </p>
      )}

      <AnimatePresence mode="wait">
        {inRound && state.status === 'selecting' && (
          <motion.div
            key={yourChoice ? 'chosen' : 'choosing'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            {yourChoice ? (
              <div className="rps-your-choice">
                <HandIcon choice={yourChoice} size={56} />
                <p>선택 완료! 결과를 기다려주세요.</p>
              </div>
            ) : (
              <div className="rps-choice-row">
                {CHOICES.map((c) => (
                  <motion.button
                    key={c}
                    className="rps-choice-btn"
                    onClick={() => choose(c)}
                    whileTap={{ scale: 0.92 }}
                    transition={springTap}
                  >
                    <HandIcon choice={c} size={40} />
                    {CHOICE_META[c].label}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {inRound && state.status === 'locked' && (
          <motion.div
            key="locked"
            className="rps-your-choice"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            {yourChoice ? (
              <HandIcon choice={yourChoice} size={56} />
            ) : (
              <span className="rps-choice-emoji">🤔</span>
            )}
            <p>입력이 잠겼습니다. 두구두구…</p>
          </motion.div>
        )}

        {state.status === 'result' && state.roundResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            <RoundResult state={state} participantId={participantId} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
