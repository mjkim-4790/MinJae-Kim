import { AnimatePresence, motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

/** 대형 스크린의 '나의 가치여정' 연출 — 각자 끝까지 남긴 단어가 도착하는 대로 모아 보여준다.
 * status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function ValuesScreenView({ state }) {
  if (state.status === 'idle') return null;

  return (
    <div className="screen__center">
      <p className="screen__eyebrow">나의 가치여정</p>
      {state.finishers.length === 0 ? (
        <motion.p
          className="screen__hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={springPop}
        >
          각자 자신에게 중요한 단어를 찾아가는 중입니다…
        </motion.p>
      ) : (
        <ul className="values-screen-grid">
          <AnimatePresence>
            {state.finishers.map((f) => (
              <motion.li
                key={f.id}
                layout
                className="values-screen-card"
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={screenPop}
              >
                <span className="values-screen-card__word">{f.word}</span>
                <span className="values-screen-card__name">{f.nickname}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
