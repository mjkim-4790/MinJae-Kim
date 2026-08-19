import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { composeEntry } from '../../lib/acrostic.js';
import { springPop, springSettle, springTap } from '../../lib/motionPresets.js';

// 카드가 "짜잔" 하고 실체를 갖고 나타나는 느낌 (LiarPlayerView.jsx 와 동일).
const materializeSpring = { type: 'spring', bounce: 0.25, duration: 0.4 };

/** 점들이 원을 그리며 차례로 흐려지는 대기 애니메이션 (§14 축소 모션에서는 정지). */
function WaitingDots() {
  return (
    <span className="loading-dots" role="status" aria-label="기다리는 중">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="loading-dots__dot" style={{ '--i': i }} />
      ))}
    </span>
  );
}

/** 읽기 전용 작품 — 앞글자를 굵게 세워서 삼행시 형태 그대로 보여준다. */
function EntryLines({ syllables, lines }) {
  return (
    <ol className="acrostic-lines">
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

/**
 * 작성 카드 — 제시어 글자마다 칸이 하나씩 (운영 결정: 글자별 칸 분리).
 * 앞글자는 고정으로 붙어 있고 참여자는 뒷부분만 적는다.
 */
function WriteCard({ syllables, lines, onChange, onSubmit, submitted, busy, error }) {
  const filled = lines.some((l) => l.trim().length > 0);

  return (
    <motion.div
      className="acrostic-write-card"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      transition={materializeSpring}
    >
      <p className="acrostic-write-card__label">한 줄씩 삼행시를 완성하세요</p>

      <div className="acrostic-write-card__rows">
        {syllables.map((syllable, i) => (
          <label key={i} className="acrostic-write-row">
            <span className="acrostic-write-row__head" aria-hidden="true">
              {syllable}
            </span>
            <input
              className="input acrostic-write-row__input"
              value={lines[i]}
              maxLength={60}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={`'${syllable}'(으)로 시작하는 한 줄`}
              aria-label={`${i + 1}번째 줄 (${syllable})`}
            />
          </label>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <motion.button
        className="button acrostic-write-card__submit"
        onClick={onSubmit}
        disabled={busy || !filled}
        whileTap={{ scale: 0.96 }}
        transition={springTap}
      >
        {submitted ? '다시 제출' : '완료'}
      </motion.button>
      {submitted && (
        <p className="acrostic-write-card__hint">제출됐어요. 마감 전까지 고쳐서 다시 낼 수 있어요.</p>
      )}
    </motion.div>
  );
}

/** 익명 투표 카드 — 본인 작품은 고르지 못하게 막는다. */
function VoteCard({ syllables, entries, yourEntryId, myVote, onVote, busy }) {
  return (
    <motion.div
      className="acrostic-vote-card"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      transition={materializeSpring}
    >
      <p className="acrostic-write-card__label">가장 마음에 드는 삼행시를 골라 눌러주세요</p>

      <ul className="acrostic-entry-list">
        {entries.map((entry) => {
          const mine = entry.entryId === yourEntryId;
          const chosen = myVote === entry.entryId;
          return (
            <li key={entry.entryId}>
              <motion.button
                type="button"
                className={`acrostic-vote-btn${chosen ? ' acrostic-vote-btn--active' : ''}${
                  mine ? ' acrostic-vote-btn--mine' : ''
                }`}
                onClick={() => !mine && onVote(entry.entryId)}
                disabled={busy || mine}
                whileTap={mine ? undefined : { scale: 0.97 }}
                transition={springTap}
              >
                <span className="acrostic-entry-card__no">
                  {entry.entryId}번{mine ? ' · 내 작품' : ''}
                </span>
                <EntryLines syllables={syllables} lines={entry.lines} />
                {chosen && <span className="acrostic-vote-btn__check" aria-hidden="true">✓</span>}
              </motion.button>
            </li>
          );
        })}
      </ul>

      {/* 참여자가 나 혼자였던 라운드 — 고를 수 있는 작품이 없으니 막힌 게 아니라고 알려준다 */}
      {entries.every((e) => e.entryId === yourEntryId) && (
        <p className="acrostic-write-card__hint">투표할 다른 작품이 없어요. 결과 발표를 기다려주세요.</p>
      )}
      {myVote != null && <p className="acrostic-write-card__hint">투표 완료! 다른 사람들을 기다려주세요.</p>}
    </motion.div>
  );
}

// 결과 모달 — 다른 게임의 승!패! 자리에 내 등수를 크게 박아준다.
function ResultModal({ open, state, participantId, onClose }) {
  const mine = state.ranking?.find((e) => e.id === participantId) ?? null;
  const won = mine?.rank === 1 && mine.votes > 0;
  // 아무도 투표하지 않은 라운드에선 전원이 0표 공동 1등이 된다 — 그대로 두면 "1등"이라고
  // 써놓고 패배 색으로 칠해지므로, 승패를 가리지 않고 무득표로 보여준다.
  const nobodyVoted = (state.ranking ?? []).every((e) => e.votes === 0);
  const modifier =
    !mine || nobodyVoted ? 'rps-verdict--none' : won ? 'rps-verdict--win' : 'rps-verdict--lose';
  const label = !mine ? '미참여' : nobodyVoted ? '무득표' : won ? '1등!' : `${mine.rank}등`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="rps-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springSettle}
          onClick={onClose}
        >
          <motion.div
            className="rps-modal"
            initial={{ opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 14 }}
            transition={springPop}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="rps-modal__eyebrow">투표 결과</p>
            <motion.p
              className={`rps-verdict ${modifier}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springPop, delay: 0.08 }}
            >
              {label}
            </motion.p>
            <p className="rps-modal__note">
              {mine ? `${mine.votes}표를 받았어요` : '이번 라운드에는 작품을 내지 않았어요'}
            </p>
            <motion.button
              className="button rps-modal__button"
              onClick={onClose}
              whileTap={{ scale: 0.96 }}
              transition={springTap}
            >
              확인
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 참여자 화면의 삼행시 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function AcrosticPlayerView({ game, participantId }) {
  const { state, yourEntryId, dismissed, submit, vote, dismiss } = game;
  const [lines, setLines] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // 제시어 글자 수가 정해지면(=새 라운드) 그 수만큼 빈 칸을 만든다.
  const syllableCount = state.syllables?.length ?? 0;
  useEffect(() => {
    setLines(Array.from({ length: syllableCount }, () => ''));
    setError(null);
  }, [syllableCount, state.prompt]);

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'writing') setMyVote(null);
    if (state.status !== 'result') setResultDismissed(false);
  }, [state.status]);

  if (state.status === 'idle') return null;

  const inRound = state.activeParticipantIds.includes(participantId);
  const mySubmitted = state.submittedParticipantIds.includes(participantId);

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

    const winners = (state.ranking ?? []).filter((e) => e.rank === 1 && e.votes > 0);
    const iWon = winners.some((e) => e.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">삼행시 — 종료</h2>
        {iWon ? (
          <motion.p
            className="typing-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 1등입니다! ({winners.find((e) => e.id === participantId)?.votes}표)
          </motion.p>
        ) : (
          <p className="rps-spectator">
            게임이 종료됐습니다.{' '}
            {winners.length > 0
              ? `1등: ${winners.map((e) => e.nickname).join(', ')} (${winners[0].votes}표)`
              : '득표한 작품이 없었습니다.'}
          </p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // 내가 완료를 눌렀고 아직 마감 전이면 "다른 참여자를 기다리는 중"
  const showWaiting = inRound && state.status === 'writing' && mySubmitted;

  return (
    <>
      <section className="panel stack acrostic-stage">
        <h2 className="panel__title">삼행시</h2>

        <p className="acrostic-prompt-banner">{state.prompt}</p>

        {!inRound && <p className="rps-spectator">이번 게임은 관전 중입니다.</p>}

        <AnimatePresence mode="wait">
          {inRound && state.status === 'writing' && (
            <WriteCard
              key="write"
              syllables={state.syllables}
              lines={lines}
              submitted={mySubmitted}
              busy={busy}
              error={error}
              onChange={(i, value) =>
                setLines((cur) => cur.map((line, idx) => (idx === i ? value : line)))
              }
              onSubmit={async () => {
                const res = await run(submit, lines);
                if (!res?.ok) {
                  setError(
                    res?.error === 'EMPTY_SUBMISSION'
                      ? '한 줄 이상 적어주세요'
                      : '제출에 실패했습니다',
                  );
                }
              }}
            />
          )}

          {inRound && state.status === 'voting' && state.entries && (
            <VoteCard
              key="vote"
              syllables={state.syllables}
              entries={state.entries}
              yourEntryId={yourEntryId}
              myVote={myVote}
              busy={busy}
              onVote={async (entryId) => {
                const res = await run(vote, entryId);
                if (res?.ok) setMyVote(entryId);
              }}
            />
          )}
        </AnimatePresence>

        {/* 완료를 누른 뒤 마감을 기다리는 동안 (사용자 요청 문구 그대로) */}
        <AnimatePresence>
          {showWaiting && (
            <motion.div
              key="waiting"
              className="rps-waiting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={springPop}
            >
              <WaitingDots />
              <p className="rps-waiting__text">다른 참여자를 기다리는 중입니다.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <ResultModal
        open={inRound && state.status === 'result' && !resultDismissed}
        state={state}
        participantId={participantId}
        onClose={() => setResultDismissed(true)}
      />
    </>
  );
}
