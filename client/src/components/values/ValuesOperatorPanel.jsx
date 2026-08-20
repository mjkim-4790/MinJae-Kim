import { useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 입장해야 시작할 수 있습니다',
  GAME_IN_PROGRESS: '이미 게임이 진행 중입니다. 먼저 리셋하세요',
  NOT_WRITING: '지금은 진행 중인 단계가 아닙니다',
};

export default function ValuesOperatorPanel({ game, participants }) {
  const { state, start, lock, reset } = game;
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
    return (
      <div className="stack">
        {state.status === 'ended' && (
          <>
            <motion.div
              className="typing-final-banner"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springPop}
            >
              {state.finishers.length > 0
                ? `끝까지 남긴 단어 ${state.finishers.length}개 도착`
                : '아직 끝까지 도달한 참여자가 없었습니다'}
            </motion.div>
            {state.finishers.length > 0 && (
              <ul className="values-finisher-list">
                {state.finishers.map((f) => (
                  <li key={f.id} className="values-finisher-list__item">
                    <span className="values-finisher-list__name">{f.nickname}</span>
                    <span className="values-finisher-list__word">{f.word}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        <p className="subtitle">
          여러 단어 중 자신에게 중요한 것을 남기고 하나씩 지워가는 개인 활동입니다. 점수는
          반영되지 않습니다 (현재 참여자 {activeCount}명)
        </p>

        {error && <p className="error-text">{error}</p>}
        {!error && activeCount < 1 && (
          <p className="subtitle">참여자가 아직 없습니다. 참여자가 입장하면 시작할 수 있어요</p>
        )}

        <button className="button" disabled={busy || activeCount < 1} onClick={() => run(start)}>
          게임 시작
        </button>
      </div>
    );
  }

  // writing
  return (
    <div className="stack">
      <p className="subtitle">각자 폰에서 진행 중입니다 · 참여자 {state.activeParticipantIds.length}명</p>
      <p className="badge badge--info">
        끝까지 도달 {state.finishers.length}/{state.activeParticipantIds.length}
      </p>

      {state.finishers.length > 0 && (
        <ul className="values-finisher-list">
          {state.finishers.map((f) => (
            <li key={f.id} className="values-finisher-list__item">
              <span className="values-finisher-list__name">{f.nickname}</span>
              <span className="values-finisher-list__word">{f.word}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions operator-topbar__actions--split">
        <button className="button" disabled={busy} onClick={() => run(lock)}>
          마감
        </button>
        <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
      </div>
    </div>
  );
}
