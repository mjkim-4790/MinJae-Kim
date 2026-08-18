import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { DIFFICULTIES, formatElapsedMs, MANUAL_DIFFICULTY_ID } from '../../lib/typing.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 1명 이상이어야 시작할 수 있습니다',
  INVALID_DIFFICULTY: '난이도를 선택하세요',
  DIFFICULTY_NOT_READY: '이 난이도는 아직 문장이 준비되지 않았습니다',
  INVALID_SENTENCE: '문장을 입력하세요',
  GAME_IN_PROGRESS: '이미 게임이 진행 중입니다. 먼저 리셋하세요',
  NOT_WRITING: '지금은 작성 단계가 아닙니다',
  NOT_LOCKED: '지금은 마감된 단계가 아닙니다',
  NOT_RESULT: '지금은 결과 단계가 아닙니다',
};

export default function TypingOperatorPanel({ game, participants }) {
  const { state, start, lock, reveal, advance, reset } = game;
  const [difficultyId, setDifficultyId] = useState(null);
  const [manualSentence, setManualSentence] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeCount = participants.filter((p) => p.status === 'active').length;

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  if (state.status === 'idle' || state.status === 'ended') {
    const isManual = difficultyId === MANUAL_DIFFICULTY_ID;

    return (
      <div className="stack">
        {state.status === 'ended' && (
          <motion.div
            className="typing-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            {state.ranking?.[0]
              ? `🏆 1등: ${state.ranking[0].nickname} (${formatElapsedMs(state.ranking[0].elapsedMs)})`
              : '완료한 참여자가 없었습니다'}
          </motion.div>
        )}

        {state.status === 'ended' && (
          // 게임 중에는 참여자 화면이 게임만 보여주므로, 다음 게임을 바로 시작하지 않고
          // 점수·메시지·순위를 다시 보여주려면 여기서 상태를 지워야 한다 (rps/liar 패턴과 동일)
          <button className="button" disabled={busy} onClick={() => run(reset)}>
            확인
          </button>
        )}

        <p className="subtitle">난이도 선택 (현재 참여자 {activeCount}명)</p>
        <ul className="typing-difficulty-grid">
          {DIFFICULTIES.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${difficultyId === d.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setDifficultyId(d.id)}
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {isManual && (
            <motion.div
              className="stack"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={springPop}
            >
              <label className="field">
                <span className="field__label">제시 문장 (직접 작성)</span>
                <textarea
                  className="textarea"
                  value={manualSentence}
                  maxLength={200}
                  rows={3}
                  onChange={(e) => setManualSentence(e.target.value)}
                  placeholder="예: 오늘 날씨가 정말 좋네요."
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="error-text">{error}</p>}

        <button
          className="button"
          disabled={busy || !difficultyId || activeCount === 0 || (isManual && !manualSentence.trim())}
          onClick={() =>
            run(start, {
              difficultyId,
              sentence: isManual ? manualSentence.trim() : undefined,
            })
          }
        >
          게임 시작
        </button>
      </div>
    );
  }

  if (state.status === 'writing' || state.status === 'locked') {
    return (
      <div className="stack">
        <p className="subtitle">
          {state.difficulty?.name} · 참여자 {state.activeParticipantIds.length}명
        </p>
        <p className="typing-sentence-preview">"{state.sentence}"</p>

        {state.status === 'writing' && (
          <>
            <p className="badge badge--info">
              제출 완료 {state.submittedParticipantIds.length}/{state.activeParticipantIds.length}
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="button" disabled={busy} onClick={() => run(lock)}>
              마감
            </button>
          </>
        )}

        {state.status === 'locked' && (
          <>
            <p className="badge badge--info">참여자 입력 잠김</p>
            {error && <p className="error-text">{error}</p>}
            <button className="button" disabled={busy} onClick={() => run(reveal)}>
              결과확인
            </button>
          </>
        )}

        <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
      </div>
    );
  }

  // result
  return (
    <motion.div
      className="stack"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springPop}
    >
      <p className="typing-sentence-preview">"{state.sentence}"</p>

      <ol className="ranking-list">
        {(state.ranking ?? []).map((r) => (
          <li key={r.id} className="ranking-item">
            <span className="ranking-rank">{r.rank}</span>
            <span className="ranking-name">{r.nickname}</span>
            <span className="ranking-time">{formatElapsedMs(r.elapsedMs)}</span>
          </li>
        ))}
      </ol>

      {state.unsubmitted?.length > 0 && (
        <p className="subtitle">미제출: {state.unsubmitted.map((p) => p.nickname).join(', ')}</p>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions">
        <button className="button button--ghost" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
        <button className="button" disabled={busy} onClick={() => run(advance)}>
          확인 (점수 반영)
        </button>
      </div>
    </motion.div>
  );
}
