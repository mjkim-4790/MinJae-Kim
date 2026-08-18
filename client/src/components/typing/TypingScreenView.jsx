import { AnimatePresence, motion } from 'motion/react';

import { formatElapsedMs } from '../../lib/typing.js';
import { springPop } from '../../lib/motionPresets.js';

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

/** 대형 스크린의 '메시지 빨리 보내기' 연출. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function TypingScreenView({ state }) {
  if (state.status === 'idle') return null;

  return (
    <AnimatePresence mode="wait">
      {(state.status === 'result' || state.status === 'ended') && state.ranking && (
        <motion.div
          key="result"
          className="screen__center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={screenPop}
        >
          <p className="screen__eyebrow">결과 발표</p>
          {state.ranking.length > 0 ? (
            <ol className="ranking-list ranking-list--large">
              {state.ranking.map((r) => (
                <li key={r.id} className="ranking-item">
                  <span className="ranking-rank">{r.rank}</span>
                  <span className="ranking-name">{r.nickname}</span>
                  <span className="ranking-time">{formatElapsedMs(r.elapsedMs)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="screen__hint">완료한 참여자가 없었습니다</p>
          )}
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
          <p className="screen__eyebrow">{state.difficulty?.name} · 마감</p>
          <p className="screen__typing-sentence">{state.sentence}</p>
          <p className="screen__hint">결과 집계 중…</p>
        </motion.div>
      )}

      {state.status === 'writing' && (
        <motion.div
          key="writing"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">{state.difficulty?.name} · 메시지 빨리 보내기</p>
          <p className="screen__typing-sentence">{state.sentence}</p>
          <p className="screen__hint">
            제출 {state.submittedParticipantIds.length}/{state.activeParticipantIds.length}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
