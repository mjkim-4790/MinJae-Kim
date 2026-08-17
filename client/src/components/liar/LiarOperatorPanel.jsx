import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { CATEGORIES, MANUAL_CATEGORY_ID } from '../../lib/liarCategories.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 3명 이상이어야 시작할 수 있습니다',
  INVALID_CATEGORY: '카테고리를 선택하세요',
  CATEGORY_NOT_READY: '이 카테고리는 아직 단어가 준비되지 않았습니다',
  INVALID_WORDS: '라이어용 · 시민용 단어를 모두 입력하세요',
  GAME_IN_PROGRESS: '이미 게임이 진행 중입니다. 먼저 리셋하세요',
  NOT_VOTING: '지금은 투표 단계가 아닙니다',
  NOT_RESULT: '지금은 결과 단계가 아닙니다',
};

function nicknameOf(participantsById, id) {
  return participantsById.get(id)?.nickname ?? `#${id}`;
}

export default function LiarOperatorPanel({ game, participants }) {
  const { state, start, lock, advance, reset } = game;
  const [categoryId, setCategoryId] = useState(null);
  const [manualLiarWord, setManualLiarWord] = useState('');
  const [manualCitizenWord, setManualCitizenWord] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const participantsById = new Map(participants.map((p) => [p.id, p]));
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
    const isManual = categoryId === MANUAL_CATEGORY_ID;

    return (
      <div className="stack">
        {state.status === 'ended' && state.result && (
          <motion.div
            className={`liar-final-banner liar-final-banner--${state.result.winner}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            {state.result.winner === 'liar' ? '🎭 라이어 승!' : '🕵️ 시민 승!'} 라이어는{' '}
            {state.result.liar?.nickname}였습니다
          </motion.div>
        )}

        {state.status === 'ended' && (
          // 게임 중에는 참여자 화면이 게임만 보여주므로, 다음 게임을 바로 시작하지 않고
          // 점수·메시지·순위를 다시 보여주려면 여기서 상태를 지워야 한다 (rps 패턴과 동일)
          <button className="button button--ghost" disabled={busy} onClick={() => run(reset)}>
            결과 지우고 참여자 화면 복귀
          </button>
        )}

        <p className="subtitle">카테고리 선택 (현재 참여자 {activeCount}명, 최소 3명 필요)</p>
        <ul className="liar-category-grid">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`liar-category-tile${categoryId === c.id ? ' liar-category-tile--active' : ''}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
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
                <span className="field__label">시민용 단어</span>
                <input
                  className="input"
                  value={manualCitizenWord}
                  maxLength={40}
                  onChange={(e) => setManualCitizenWord(e.target.value)}
                  placeholder="예: 사과"
                />
              </label>
              <label className="field">
                <span className="field__label">라이어용 단어</span>
                <input
                  className="input"
                  value={manualLiarWord}
                  maxLength={40}
                  onChange={(e) => setManualLiarWord(e.target.value)}
                  placeholder="예: 배"
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="error-text">{error}</p>}

        <button
          className="button"
          disabled={busy || !categoryId || activeCount < 3}
          onClick={() =>
            run(start, {
              categoryId,
              citizenWord: isManual ? manualCitizenWord.trim() : undefined,
              liarWord: isManual ? manualLiarWord.trim() : undefined,
            })
          }
        >
          게임 시작
        </button>
      </div>
    );
  }

  if (state.status === 'describing' || state.status === 'voting') {
    return (
      <div className="stack">
        <p className="subtitle">
          카테고리 {state.category?.name} · 참여자 {state.activeParticipantIds.length}명
        </p>

        {state.status === 'describing' && (
          <>
            <p className="badge badge--info">
              지금 차례: {nicknameOf(participantsById, state.currentTurnParticipantId)}
            </p>
            <p className="subtitle">
              발언 순서: {state.turnOrder.map((id) => nicknameOf(participantsById, id)).join(' → ')}
            </p>
            <p className="subtitle">
              참여자들이 직접 '다음' · '정지' 버튼으로 진행합니다. 누군가 정지를 누르면 자동으로
              투표 단계로 넘어가요.
            </p>
          </>
        )}

        {state.status === 'voting' && (
          <>
            <p>
              지목 완료 {state.votedParticipantIds.length}/{state.activeParticipantIds.length}
            </p>
            {error && <p className="error-text">{error}</p>}
            <button className="button" disabled={busy} onClick={() => run(lock)}>
              투표 마감
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
      <p className={`liar-verdict-line liar-verdict-line--${state.result.winner}`}>
        {state.result.winner === 'liar' ? '🎭 라이어 승' : '🕵️ 시민 승'}
      </p>
      <p className="subtitle">
        실제 라이어: <strong>{state.result.liar?.nickname}</strong> · 최다 지목:{' '}
        <strong>{state.result.tie ? '동률 (무효)' : state.result.accused?.nickname ?? '없음'}</strong>
      </p>
      <p className="chat__message--player" style={{ padding: 8, borderRadius: 8 }}>
        시민 단어: {state.result.citizenWord}
      </p>
      <p className="chat__message--operator" style={{ padding: 8, borderRadius: 8 }}>
        라이어 단어: {state.result.liarWord}
      </p>

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
