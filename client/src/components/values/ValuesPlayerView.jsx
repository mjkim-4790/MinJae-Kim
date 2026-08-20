import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { MAX_WORDS, MIN_WORDS } from '../../lib/values.js';
import { springMove, springPop, springTap } from '../../lib/motionPresets.js';

// 카드가 "짜잔" 하고 실체를 갖고 나타나는 느낌 (다른 게임 카드와 동일한 톤).
const materializeSpring = { type: 'spring', bounce: 0.25, duration: 0.4 };

/** 빨간 색연필로 취소선을 그은 질감 — 겹친 두 스트로크를 그려지는 애니메이션과 함께 얹는다. */
function PencilCrossMark() {
  return (
    <svg className="values-cross-mark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <motion.path
        d="M4 8 C 30 22, 55 4, 70 18 S 96 10, 96 22"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      <motion.path
        className="values-cross-mark__under"
        d="M6 21 C 34 7, 58 25, 94 13"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.06, ease: 'easeOut' }}
      />
    </svg>
  );
}

/** 10~15개 단어를 글자별이 아니라 칸별로 자유롭게 입력하는 폼 — 칸을 추가/삭제할 수 있다. */
function WordInputForm({ onSubmit, busy, error }) {
  const [words, setWords] = useState(() => Array.from({ length: MIN_WORDS }, () => ''));

  const setWord = (i, value) => setWords((cur) => cur.map((w, idx) => (idx === i ? value : w)));
  const addRow = () => setWords((cur) => (cur.length < MAX_WORDS ? [...cur, ''] : cur));
  const removeRow = (i) => setWords((cur) => (cur.length > MIN_WORDS ? cur.filter((_, idx) => idx !== i) : cur));

  const canProceed = words.length >= MIN_WORDS && words.length <= MAX_WORDS && words.every((w) => w.trim().length > 0);

  return (
    <motion.div
      className="values-write-card"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={materializeSpring}
    >
      <p className="values-write-card__label">
        나에게 중요한 단어를 {MIN_WORDS}~{MAX_WORDS}개 적어보세요
      </p>

      <ol className="values-input-list">
        {words.map((w, i) => (
          <li key={i} className="values-input-row">
            <span className="values-input-row__no">{i + 1}</span>
            <input
              className="input values-input-row__input"
              value={w}
              maxLength={20}
              onChange={(e) => setWord(i, e.target.value)}
              placeholder="단어 입력"
            />
            <button
              type="button"
              className="values-input-row__remove"
              onClick={() => removeRow(i)}
              disabled={words.length <= MIN_WORDS}
              aria-label="이 칸 삭제"
            >
              ×
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="button button--ghost values-input-add"
        onClick={addRow}
        disabled={words.length >= MAX_WORDS}
      >
        + 단어 추가 ({words.length}/{MAX_WORDS})
      </button>

      {error && <p className="error-text">{error}</p>}

      <button className="button" disabled={busy || !canProceed} onClick={() => onSubmit(words.map((w) => w.trim()))}>
        다음
      </button>
    </motion.div>
  );
}

/**
 * 단어 박스 그리드 + 지우기. 지운 단어는 사라지지 않고 빨간 색연필 취소선만 얹힌다.
 * 마지막 1개가 남으면(done) 그 박스만 layoutId 를 공유한 별도 오버레이로 옮겨가며
 * 화면 중앙으로 이동한다(/apple-design §4 Move/reposition — springMove).
 */
function EliminationBoard({ words, crossedIndices, done, finalWord, onCross, busy }) {
  const finalIndex = done ? words.findIndex((_, i) => !crossedIndices.includes(i)) : -1;

  return (
    <div className="values-stage">
      <div className="values-grid">
        {words.map((w, i) => {
          if (i === finalIndex) return null; // 화면 중앙 오버레이로 이동 — 지운 게 아니라 자리를 옮긴 것
          const crossed = crossedIndices.includes(i);
          return (
            <motion.button
              key={i}
              layout
              layoutId={`values-word-${i}`}
              type="button"
              className={`values-word${crossed ? ' values-word--crossed' : ''}`}
              onClick={() => !crossed && onCross(i)}
              disabled={busy || crossed}
              whileTap={!crossed ? { scale: 0.94 } : undefined}
              transition={crossed ? springMove : springTap}
            >
              <span className="values-word__text">{w}</span>
              {crossed && <PencilCrossMark />}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {done && (
          <motion.div
            layoutId={`values-word-${finalIndex}`}
            className="values-final"
            transition={springMove}
          >
            <p className="values-final__eyebrow">끝까지 버리지 못한 단어</p>
            <span className="values-word values-word--final">
              <span className="values-word__text">{finalWord}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 참여자 화면의 '나의 가치여정' 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function ValuesPlayerView({ game, participantId }) {
  const { state, yours, dismissed, submit, cross, dismiss } = game;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (state.status === 'idle') return null;

  const inRound = state.activeParticipantIds.includes(participantId);

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    setBusy(false);
    return res;
  };

  if (state.status === 'ended') {
    // 운영자가 리셋하기 전이라도 각자 "확인"을 누르면 원래 화면으로 돌아갈 수 있다.
    if (dismissed) return null;

    return (
      <section className="panel stack">
        <h2 className="panel__title">나의 가치여정 — 종료</h2>
        {yours?.done ? (
          <motion.div
            className="typing-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            당신이 끝까지 남긴 단어: {yours.finalWord}
          </motion.div>
        ) : (
          <p className="rps-spectator">게임이 종료됐습니다.</p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // writing
  return (
    <section className="panel stack values-panel">
      <h2 className="panel__title">나의 가치여정</h2>

      {!inRound && <p className="rps-spectator">이번 게임은 관전 중입니다.</p>}

      {inRound && !yours && (
        <WordInputForm
          busy={busy}
          error={error}
          onSubmit={async (words) => {
            const res = await run(submit, words);
            if (!res?.ok) {
              setError(
                res?.error === 'INVALID_WORD_COUNT'
                  ? `단어는 ${MIN_WORDS}~${MAX_WORDS}개여야 합니다`
                  : '제출에 실패했습니다',
              );
            }
          }}
        />
      )}

      {inRound && yours && (
        <>
          {!yours.done && <p className="subtitle">하나씩 눌러서 지워보세요. 마지막 1개가 남을 때까지.</p>}
          <EliminationBoard
            words={yours.words}
            crossedIndices={yours.crossedIndices}
            done={yours.done}
            finalWord={yours.finalWord}
            busy={busy}
            onCross={(index) => run(cross, index)}
          />
          {yours.done && (
            <p className="subtitle">진행자가 마감을 누르면 다음으로 넘어갑니다. 그때까지 천천히 바라보세요.</p>
          )}
        </>
      )}
    </section>
  );
}
