import { AnimatePresence, motion } from 'motion/react';

import { composeEntry } from '../../lib/acrostic.js';
import { springPop } from '../../lib/motionPresets.js';

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

/** 작품 한 편 — 대형 스크린용 큰 글씨. */
function ScreenEntryLines({ syllables, lines }) {
  return (
    <ol className="acrostic-lines acrostic-lines--screen">
      {composeEntry(syllables, lines).map((text, i) => (
        <li key={i} className="acrostic-lines__row">
          <span className="acrostic-lines__head">{syllables[i]}</span>
          <span className="acrostic-lines__tail">{lines?.[i]}</span>
          <span className="sr-only">{text}</span>
        </li>
      ))}
    </ol>
  );
}

/** 대형 스크린의 삼행시 연출. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function AcrosticScreenView({ state }) {
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
          <p className="screen__eyebrow">투표 결과 · {state.prompt}</p>
          <ul className="acrostic-screen-grid">
            {state.ranking.map((entry) => (
              <li
                key={entry.entryId}
                className={`acrostic-screen-card${
                  entry.rank === 1 && entry.votes > 0 ? ' acrostic-screen-card--winner' : ''
                }`}
              >
                <div className="acrostic-screen-card__meta">
                  <span className="acrostic-screen-card__rank">{entry.rank}등</span>
                  <span className="acrostic-screen-card__author">{entry.nickname}</span>
                  <span className="acrostic-screen-card__votes">{entry.votes}표</span>
                </div>
                <ScreenEntryLines syllables={state.syllables} lines={entry.lines} />
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {state.status === 'voting' && (
        <motion.div
          key="voting"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">투표 중 · {state.prompt}</p>
          <ul className="acrostic-screen-grid">
            {(state.entries ?? []).map((entry) => (
              <li key={entry.entryId} className="acrostic-screen-card">
                <span className="acrostic-screen-card__no">{entry.entryId}번</span>
                <ScreenEntryLines syllables={state.syllables} lines={entry.lines} />
              </li>
            ))}
          </ul>
          <p className="screen__hint">
            투표 {state.votedParticipantIds.length}/{state.activeParticipantIds.length}
          </p>
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
          <p className="screen__eyebrow">삼행시</p>
          <p className="screen__acrostic-prompt">{state.prompt}</p>
          <p className="screen__hint">
            완료 {state.submittedParticipantIds.length}/{state.activeParticipantIds.length}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
