import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { allowedChairs, playerAngle } from '../../lib/chairs.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  CHAIR_TAKEN: '이미 다른 사람이 앉았어요! 옆 의자를 노려보세요',
  TOO_FAR: '너무 먼 의자예요',
  ALREADY_SEATED: '이미 앉았어요',
  NOT_GRABBING: '아직이에요!',
  NOT_IN_ROUND: '이번 라운드 참가자가 아니에요',
};

export default function ChairsPlayerView({ game, participantId }) {
  const { state, mySeat, dismissed, serverTime, sit, dismiss } = game;
  const [error, setError] = useState(null);
  const [, tick] = useState(0);

  // 남은 시간 표시를 위해 앉는 동안만 다시 그린다
  useEffect(() => {
    if (state.status !== 'grabbing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  useEffect(() => {
    setError(null);
  }, [state.status, state.round]);

  if (state.status === 'idle' && state.round === 0) return null;

  const me = state.players.find((p) => p.participantId === participantId);
  const inRound = !!me;
  const eliminated = state.eliminatedIds.includes(participantId);

  if (state.status === 'ended') {
    if (dismissed) return null;
    const won = state.result?.survivors?.some((s) => s.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">의자 빨리 뺏기 — 종료</h2>
        {won ? (
          <motion.p className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
            🏆 최후의 1인! ({state.round}라운드)
          </motion.p>
        ) : (
          <p className="rps-spectator">
            우승: {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'}
          </p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  if (!inRound) {
    return (
      <section className="panel stack chairs-stage">
        <h2 className="panel__title">의자 빨리 뺏기</h2>
        <p className="rps-spectator">
          {eliminated ? '탈락해서 관전 중입니다.' : '이번 게임은 관전 중입니다.'}
        </p>
      </section>
    );
  }

  const grabbing = state.status === 'grabbing';
  const msLeft = state.grabEndsAt ? Math.max(0, state.grabEndsAt - serverTime()) : 0;
  const seated = mySeat != null;

  // 내가 잡을 수 있는 의자 — 서버와 같은 규칙으로 계산한다
  const myChairs =
    grabbing && state.freezeAngle != null
      ? allowedChairs(playerAngle(me.angleIndex, state.players.length, state.freezeAngle), state.chairCount)
      : [];
  const takenSet = new Set(state.taken.map((t) => t.chairIndex));

  const grab = async (chairIndex) => {
    setError(null);
    const res = await sit(chairIndex);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '앉지 못했어요');
  };

  return (
    <section className="panel stack chairs-stage">
      <h2 className="panel__title">
        의자 빨리 뺏기 — {state.round}라운드 · 의자 {state.chairCount}개
      </h2>

      {state.status === 'spinning' && (
        <>
          <motion.p
            className="chairs-wait"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.1 }}
          >
            🎵 돌고 있어요…
          </motion.p>
          <p className="subtitle">호루라기가 울리면 바로 의자를 누르세요!</p>
        </>
      )}

      {state.status === 'result' && (
        <p className={`chairs-verdict ${seated ? 'chairs-verdict--safe' : 'chairs-verdict--out'}`}>
          {seated ? `${mySeat + 1}번 의자에 앉았어요!` : '자리를 못 잡았어요…'}
        </p>
      )}

      {state.status === 'idle' && state.round > 0 && (
        <p className="subtitle">다음 라운드를 기다리는 중…</p>
      )}

      {grabbing && (
        <>
          <motion.p
            className="chairs-whistle"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springPop}
          >
            앉으세요!
          </motion.p>
          <p className="chairs-countdown">{(msLeft / 1000).toFixed(1)}초</p>

          {seated ? (
            <p className="chairs-verdict chairs-verdict--safe">
              {mySeat + 1}번 의자를 잡았어요!
            </p>
          ) : (
            <>
              <div className={`chairs-grab${myChairs.length === 1 ? ' chairs-grab--single' : ''}`}>
                {myChairs.map((c) => {
                  const taken = takenSet.has(c);
                  return (
                    <motion.button
                      key={c}
                      type="button"
                      className={`chairs-grab__btn${taken ? ' chairs-grab__btn--taken' : ''}`}
                      onClick={() => grab(c)}
                      disabled={taken}
                      whileTap={{ scale: 0.95 }}
                      transition={springTap}
                    >
                      <span className="chairs-grab__icon">🪑</span>
                      <span className="chairs-grab__num">{c + 1}번</span>
                      {taken && <span className="chairs-grab__taken">뺏겼어요</span>}
                    </motion.button>
                  );
                })}
              </div>
              <p className="subtitle">
                {state.chairCount === 1
                  ? '마지막 의자예요! 먼저 누르는 사람이 우승!'
                  : '내 양옆 의자만 잡을 수 있어요'}
              </p>
            </>
          )}

          {error && <p className="error-text">{error}</p>}
        </>
      )}
    </section>
  );
}
