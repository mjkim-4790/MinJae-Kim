import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { formatElapsedMs } from '../../lib/typing.js';
import { springPop, springSettle, springTap } from '../../lib/motionPresets.js';

// 하단 고정 시트 전용 스프링 — Apple 이 "Drawer / sheet" 에 쓰는 값(damping 0.8,
// response 0.3)에 가깝게 맞춘 살짝의 바운스 (RpsPlayerView.jsx 의 sheetSpring 과 동일).
const sheetSpring = { type: 'spring', bounce: 0.2, duration: 0.35 };
// 카드가 "짜잔" 하고 실체를 갖고 나타나는 느낌 (LiarPlayerView.jsx 의 materializeSpring 과 동일).
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

// 제시 문장 카드 — 라이어 게임의 단어 카드와 같은 자리, 같은 연출.
function SentenceCard({ sentence }) {
  return (
    <motion.div
      className="typing-sentence-card"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
      transition={materializeSpring}
    >
      <p className="typing-sentence-card__label">이 문장을 그대로 입력하고 전송하세요</p>
      <p className="typing-sentence-card__text">{sentence}</p>
    </motion.div>
  );
}

// 가위바위보의 하단 고정 선택 시트를 그대로 재사용하되, 선택 버튼 대신 텍스트
// 입력 + 전송 버튼을 놓는다 (사용자 요청).
function InputSheet({ open, onSubmit, busy, error }) {
  const [text, setText] = useState('');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="rps-choice-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={sheetSpring}
        >
          <p className="rps-choice-sheet__hint">문장을 그대로 입력하고 전송하세요</p>
          <form
            className="typing-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              onSubmit(text);
            }}
          >
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="문장 입력"
              autoComplete="off"
              disabled={busy}
            />
            <motion.button
              className="button"
              type="submit"
              disabled={busy || !text.trim()}
              whileTap={{ scale: 0.96 }}
              transition={springTap}
            >
              전송
            </motion.button>
          </form>
          {error && <p className="error-text">{error}</p>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 결과 모달. 딤 처리한 배경 위로 내 등수를 크게 박아준다 (§12 딤으로 집중,
// §7 나타난 자리로 다시 사라짐 — RpsPlayerView.jsx/LiarPlayerView.jsx 와 동일한 패턴).
function ResultModal({ open, state, participantId, onClose }) {
  const mine = state.ranking?.find((r) => r.id === participantId) ?? null;
  const won = mine?.rank === 1;
  const modifier = !mine ? 'rps-verdict--none' : won ? 'rps-verdict--win' : 'rps-verdict--lose';
  const label = !mine ? '미완료' : `${mine.rank}등!`;

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
            <p className="rps-modal__eyebrow">결과</p>
            <motion.p
              className={`rps-verdict ${modifier}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springPop, delay: 0.08 }}
            >
              {label}
            </motion.p>
            <p className="rps-modal__note">
              {mine ? `기록: ${formatElapsedMs(mine.elapsedMs)}` : '제시 문장을 완성하지 못했습니다'}
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

/** 참여자 화면의 '메시지 빨리 보내기' 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function TypingPlayerView({ game, participantId }) {
  const { state, dismissed, submit, dismiss } = game;
  const [resultDismissed, setResultDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (state.status !== 'result') setResultDismissed(false);
  }, [state.status]);

  useEffect(() => {
    if (state.status === 'writing') setError(null);
  }, [state.status]);

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    // 운영자가 리셋하기 전이라도 각자 "확인"을 누르면 원래 화면(점수/채팅/순위)으로
    // 돌아갈 수 있다 — 서버 상태는 그대로 두고 이 참여자 화면에서만 숨긴다.
    if (dismissed) return null;

    const winner = state.ranking?.[0] ?? null;
    const isWinner = winner?.id === participantId;
    return (
      <section className="panel stack">
        <h2 className="panel__title">메시지 빨리 보내기 — 종료</h2>
        {isWinner ? (
          <motion.p
            className="typing-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 1등입니다! ({formatElapsedMs(winner.elapsedMs)})
          </motion.p>
        ) : (
          <p className="rps-spectator">
            게임이 종료됐습니다.{' '}
            {winner ? `1등: ${winner.nickname} (${formatElapsedMs(winner.elapsedMs)})` : '완료한 참여자가 없었습니다.'}
          </p>
        )}
        {state.ranking?.length > 0 && (
          <ol className="ranking-list">
            {state.ranking.map((r) => (
              <li key={r.id} className="ranking-item">
                <span className="ranking-rank">{r.rank}</span>
                <span className="ranking-name">{r.nickname}</span>
                <span className="ranking-time">{formatElapsedMs(r.elapsedMs)}</span>
              </li>
            ))}
          </ol>
        )}
        <motion.button
          className="button"
          onClick={dismiss}
          whileTap={{ scale: 0.96 }}
          transition={springTap}
        >
          확인
        </motion.button>
      </section>
    );
  }

  const inRound = state.activeParticipantIds.includes(participantId);
  const mySubmitted = state.submittedParticipantIds.includes(participantId);
  const showInputSheet = inRound && state.status === 'writing' && !mySubmitted;
  const showWaiting =
    inRound &&
    (state.status === 'locked' || state.status === 'result' || (state.status === 'writing' && mySubmitted));
  const showResultModal = inRound && state.status === 'result' && !resultDismissed;

  const handleSubmit = async (text) => {
    setBusy(true);
    setError(null);
    const res = await submit(text);
    setBusy(false);
    if (!res?.ok) {
      setError(res?.error === 'MISMATCH' ? '문장이 정확하지 않습니다. 다시 확인해주세요' : '전송에 실패했습니다');
    }
  };

  return (
    <>
      <section className="panel stack typing-stage">
        <h2 className="panel__title">메시지 빨리 보내기 — {state.difficulty?.name}</h2>

        {!inRound && <p className="rps-spectator">이번 게임은 관전 중입니다.</p>}

        {inRound && state.sentence && <SentenceCard sentence={state.sentence} />}

        <AnimatePresence mode="wait">
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
              <p className="rps-waiting__text">완료되었습니다</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <InputSheet open={showInputSheet} onSubmit={handleSubmit} busy={busy} error={error} />

      <ResultModal
        open={showResultModal}
        state={state}
        participantId={participantId}
        onClose={() => setResultDismissed(true)}
      />
    </>
  );
}
