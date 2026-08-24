import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import CupShuffle from './CupShuffle.jsx';
import { springPop, springSettle, springTap } from '../../lib/motionPresets.js';

/** 참여자 화면의 야바위 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function YabawiPlayerView({ game, participantId }) {
  const { state, myPick, dismissed, pick, dismiss } = game;
  const [resultDismissed, setResultDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  // 판이 바뀌면 다음 결과 모달을 다시 볼 수 있게 초기화 (다른 게임들과 같은 패턴)
  useEffect(() => {
    if (state.status !== 'result') setResultDismissed(false);
  }, [state.status]);

  if (state.status === 'idle') return null;

  const inRound = state.activeParticipantIds.includes(participantId);
  const eliminated = state.round > 0 && !inRound;

  if (state.status === 'ended') {
    if (dismissed) return null;
    const won = state.result?.survivors?.some((s) => s.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">야바위 게임 — 종료</h2>
        {won ? (
          <motion.p
            className="typing-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 최후의 생존자입니다! ({state.round}판)
          </motion.p>
        ) : (
          <p className="rps-spectator">
            게임이 종료됐습니다. 최종 생존:{' '}
            {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'}
          </p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  const canPick = inRound && state.status === 'picking' && myPick === null;
  const showResultModal = inRound && state.status === 'result' && !resultDismissed;

  return (
    <>
      <section className="panel stack yabawi-stage">
        <h2 className="panel__title">
          야바위 게임 — {state.round}판 · {state.difficulty?.name}
        </h2>

        {eliminated && <p className="rps-spectator">탈락해서 관전 중입니다.</p>}
        {!inRound && !eliminated && <p className="rps-spectator">이번 게임은 관전 중입니다.</p>}

        <CupShuffle
          plan={state.plan}
          status={state.status}
          answerSlot={state.answerSlot}
          myPick={myPick}
          interactive={canPick}
          onPick={async (slot) => {
            setBusy(true);
            await pick(slot);
            setBusy(false);
          }}
        />

        {state.status === 'shuffling' && <p className="subtitle">잘 보세요! 공이 어디로 가는지…</p>}
        {state.status === 'picking' && inRound && (
          <p className="subtitle">
            {myPick === null
              ? '공이 있는 자리를 골라주세요'
              : `${myPick + 1}번을 골랐어요. 다른 사람들을 기다리는 중…`}
          </p>
        )}
        {busy && <p className="subtitle">전송 중…</p>}
      </section>

      <AnimatePresence>
        {showResultModal && (
          <motion.div
            className="rps-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springSettle}
            onClick={() => setResultDismissed(true)}
          >
            <motion.div
              className="rps-modal"
              initial={{ opacity: 0, scale: 0.86, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 14 }}
              transition={springPop}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="rps-modal__eyebrow">{state.round}판 결과</p>
              {(() => {
                const survived = state.result?.survivors?.some((s) => s.id === participantId);
                const wipeout = state.result?.outcome === 'wipeout';
                const label = wipeout ? '무효' : survived ? '생존!' : '탈락';
                const modifier = wipeout
                  ? 'rps-verdict--none'
                  : survived
                    ? 'rps-verdict--win'
                    : 'rps-verdict--lose';
                return (
                  <>
                    <motion.p
                      className={`rps-verdict ${modifier}`}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...springPop, delay: 0.08 }}
                    >
                      {label}
                    </motion.p>
                    <p className="rps-modal__note">
                      정답은 {(state.answerSlot ?? 0) + 1}번
                      {myPick !== null ? ` · 내 선택 ${myPick + 1}번` : ' · 고르지 못했어요'}
                    </p>
                    {wipeout && <p className="rps-modal__note">아무도 못 맞혀서 같은 인원으로 다시 합니다</p>}
                  </>
                );
              })()}
              <motion.button
                className="button rps-modal__button"
                onClick={() => setResultDismissed(true)}
                whileTap={{ scale: 0.96 }}
                transition={springTap}
              >
                확인
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
