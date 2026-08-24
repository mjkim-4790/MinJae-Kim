import { AnimatePresence, motion } from 'motion/react';

import CupShuffle from './CupShuffle.jsx';
import { springPop } from '../../lib/motionPresets.js';

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

/** 대형 스크린의 야바위 연출 — 참여자 폰과 같은 CupShuffle 을 같은 plan 으로 재생하므로
 * 두 화면이 똑같이 움직인다. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function YabawiScreenView({ state }) {
  if (state.status === 'idle') return null;

  const result = state.result;
  const wipeout = result?.outcome === 'wipeout';

  return (
    <div className="screen__center">
      <p className="screen__eyebrow">
        야바위 게임 · {state.round}판 · {state.difficulty?.name}
      </p>

      <div className="yabawi-screen-board">
        <CupShuffle plan={state.plan} status={state.status} answerSlot={state.answerSlot} />
      </div>

      <AnimatePresence mode="wait">
        {state.status === 'shuffling' && (
          <motion.p
            key="shuffling"
            className="screen__hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            공이 어디로 가는지 잘 보세요!
          </motion.p>
        )}

        {state.status === 'picking' && (
          <motion.p
            key="picking"
            className="screen__hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            선택 {state.pickedParticipantIds.length}/{state.activeParticipantIds.length}
          </motion.p>
        )}

        {(state.status === 'result' || state.status === 'ended') && result && (
          <motion.div
            key="result"
            className="yabawi-screen-result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={screenPop}
          >
            {wipeout ? (
              <p className="screen__eyebrow">아무도 못 맞혔어요 — 다시 합니다</p>
            ) : (
              <>
                <p className="yabawi-screen-result__line yabawi-screen-result__line--survive">
                  생존 {result.survivors.length}명
                  {result.survivors.length > 0 && ` · ${result.survivors.map((s) => s.nickname).join(', ')}`}
                </p>
                {result.eliminated.length > 0 && (
                  <p className="yabawi-screen-result__line yabawi-screen-result__line--out">
                    탈락 {result.eliminated.length}명 · {result.eliminated.map((s) => s.nickname).join(', ')}
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
