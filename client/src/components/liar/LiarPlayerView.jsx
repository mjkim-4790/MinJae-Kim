import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { springPop, springSettle, springTap } from '../../lib/motionPresets.js';

// 카드가 "짜잔" 하고 실체를 갖고 나타나는 느낌 — 블러+스케일을 함께 움직인다 (§12 머티리얼라이즈).
const materializeSpring = { type: 'spring', bounce: 0.25, duration: 0.4 };

function nicknameOf(participantsById, id) {
  return participantsById.get(id)?.nickname ?? `#${id}`;
}

// 가위바위보의 하단 고정 시트 대신, 제시어는 화면 "중간"에 카드 형태로 계속 떠 있는다
// (§12 머티리얼 — 반투명 층). 내 차례가 되면 컨트롤 영역에 옅은 빨간 배경이 들어온다.
function WordCard({ word, isLiar, isMyTurn, onNext, onStop, busy }) {
  return (
    <motion.div
      className="liar-word-card"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={materializeSpring}
    >
      {isLiar && <p className="liar-word-card__role">당신은 라이어입니다 🎭</p>}
      <p className="liar-word-card__label">{isLiar ? '이 단어로 시민인 척 설명하세요' : '이 단어를 설명하세요'}</p>
      <p className="liar-word-card__word">{word}</p>

      <div className={`liar-word-card__controls${isMyTurn ? ' liar-word-card__controls--myturn' : ''}`}>
        {isMyTurn && <p className="liar-word-card__turn-hint">지금 당신 차례예요 👇</p>}
        <div className="liar-word-card__buttons">
          <motion.button
            className="button button--ghost"
            onClick={onNext}
            disabled={busy}
            whileTap={{ scale: 0.96 }}
            transition={springTap}
          >
            다음
          </motion.button>
          <motion.button
            className="button button--danger"
            onClick={onStop}
            disabled={busy}
            whileTap={{ scale: 0.96 }}
            transition={springTap}
          >
            정지 (의심돼요)
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function VoteCard({ candidates, myVote, onVote, busy }) {
  return (
    <motion.div
      className="liar-word-card"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={materializeSpring}
    >
      <p className="liar-word-card__label">라이어라고 생각하는 사람을 지목하세요</p>
      <ul className="liar-vote-list">
        {candidates.map((p) => (
          <li key={p.id}>
            <motion.button
              type="button"
              className={`liar-vote-btn${myVote === p.id ? ' liar-vote-btn--active' : ''}`}
              onClick={() => onVote(p.id)}
              disabled={busy}
              whileTap={{ scale: 0.96 }}
              transition={springTap}
            >
              {p.nickname}
            </motion.button>
          </li>
        ))}
      </ul>
      {myVote != null && <p className="liar-word-card__turn-hint">지목 완료! 다른 사람들을 기다려주세요.</p>}
    </motion.div>
  );
}

function ResultModal({ open, state, participantId, onClose }) {
  const result = state.result;
  const won = result && (result.winner === 'liar') === (result.liar?.id === participantId);

  return (
    <AnimatePresence>
      {open && result && (
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
            <motion.p
              className={`liar-verdict-line liar-verdict-line--${result.winner}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springPop, delay: 0.08 }}
            >
              {result.winner === 'liar' ? '🎭 라이어 승' : '🕵️ 시민 승'}
            </motion.p>
            <p className="rps-modal__note">
              실제 라이어: <strong>{result.liar?.nickname}</strong>
              {won ? ' · 당신이 이겼어요!' : ' · 아쉽게 졌어요'}
            </p>
            <p className="rps-modal__note">
              시민 단어 "{result.citizenWord}" · 라이어 단어 "{result.liarWord}"
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

/** 참여자 화면의 라이어 게임 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function LiarPlayerView({ game, participantId, participants = [] }) {
  const { state, yourWord, next, stop, vote } = game;
  const [myVote, setMyVote] = useState(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === 'idle' || state.status === 'describing') setMyVote(null);
    if (state.status !== 'result') setResultDismissed(false);
  }, [state.status]);

  if (state.status === 'idle') return null;

  const participantsById = new Map(participants.map((p) => [p.id, p]));
  const inRound = state.activeParticipantIds.includes(participantId);

  const run = async (action, ...args) => {
    setBusy(true);
    const res = await action(...args);
    setBusy(false);
    return res;
  };

  if (state.status === 'ended') {
    const won = state.result && (state.result.winner === 'liar') === (state.result.liar?.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">라이어 게임 — 종료</h2>
        <p className={`liar-verdict-line liar-verdict-line--${state.result?.winner}`}>
          {state.result?.winner === 'liar' ? '🎭 라이어 승' : '🕵️ 시민 승'}
        </p>
        <p className="rps-spectator">
          {won ? '당신이 이겼습니다! 🎉' : '아쉽게 졌습니다.'} 실제 라이어는{' '}
          {state.result?.liar?.nickname}였습니다.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel stack liar-stage">
        <h2 className="panel__title">라이어 게임 — {state.category?.name}</h2>

        {!inRound && <p className="rps-spectator">이번 게임은 관전 중입니다.</p>}

        {inRound && state.status === 'describing' && yourWord && (
          <WordCard
            word={yourWord.word}
            isLiar={yourWord.isLiar}
            isMyTurn={state.currentTurnParticipantId === participantId}
            onNext={() => run(next)}
            onStop={() => run(stop)}
            busy={busy}
          />
        )}

        {inRound && state.status === 'voting' && (
          <VoteCard
            candidates={state.activeParticipantIds
              .filter((id) => id !== participantId)
              .map((id) => participantsById.get(id) ?? { id, nickname: nicknameOf(participantsById, id) })}
            myVote={myVote}
            busy={busy}
            onVote={async (accusedId) => {
              const res = await run(vote, accusedId);
              if (res?.ok) setMyVote(accusedId);
            }}
          />
        )}
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
