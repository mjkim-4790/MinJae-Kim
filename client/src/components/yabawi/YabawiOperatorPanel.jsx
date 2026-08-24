import { useState } from 'react';
import { motion } from 'motion/react';

import { DIFFICULTIES } from '../../lib/yabawi.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 입장해야 시작할 수 있습니다',
  INVALID_DIFFICULTY: '난이도를 선택하세요',
  ROUND_IN_PROGRESS: '지금 판이 진행 중입니다',
  NOT_PICKING: '지금은 고르는 단계가 아닙니다',
  NOT_RESULT: '지금은 결과 단계가 아닙니다',
};

export default function YabawiOperatorPanel({ game, participants }) {
  const { state, start, reveal, advance, reset } = game;
  const [difficultyId, setDifficultyId] = useState('easy');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeCount = participants.filter((p) => p.status === 'active').length;
  const survivorCount = state.activeParticipantIds.length;

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  // 판 사이 / 시작 전
  if (state.status === 'idle' || state.status === 'ended') {
    const isNextRound = state.round > 0 && survivorCount > 0;
    const canStart = isNextRound ? survivorCount > 0 : activeCount > 0;

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
              🏆 최종 생존:{' '}
              {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'} ({state.round}판)
            </motion.div>
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        {state.status === 'idle' && isNextRound && (
          <p className="badge badge--info">
            {state.round}판 종료 · 생존 {survivorCount}명 — 다음 판 난이도를 고르세요
          </p>
        )}

        <p className="subtitle">
          컵을 섞은 뒤 공이 어디 있는지 맞히는 게임입니다. 틀리면 탈락하고, 맞힌 사람끼리 다음 판을
          이어갑니다 (현재 참여자 {isNextRound ? survivorCount : activeCount}명)
        </p>

        <ul className="typing-difficulty-grid">
          {DIFFICULTIES.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${difficultyId === d.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setDifficultyId(d.id)}
              >
                {d.name}
                <span className="yabawi-difficulty-desc">{d.desc}</span>
                <span className="yabawi-difficulty-points">{d.points}점</span>
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="error-text">{error}</p>}
        {!error && !canStart && <p className="subtitle">참여자가 아직 없습니다.</p>}

        <div className="operator-topbar__actions operator-topbar__actions--split">
          <button className="button" disabled={busy || !canStart} onClick={() => run(start, difficultyId)}>
            {isNextRound ? `${state.round + 1}판 시작` : '게임 시작'}
          </button>
          {state.round > 0 && (
            <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
              게임 강제 리셋
            </button>
          )}
        </div>
      </div>
    );
  }

  // 섞는 중
  if (state.status === 'shuffling') {
    return (
      <div className="stack">
        <p className="acrostic-prompt-banner">{state.round}판 · {state.difficulty?.name}</p>
        <p className="badge badge--info">컵을 섞는 중입니다…</p>
        <p className="subtitle">
          모든 화면에서 같은 움직임이 재생됩니다. 섞기가 끝나면 자동으로 고르는 단계로 넘어가요.
        </p>
        <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
      </div>
    );
  }

  // 고르는 중
  if (state.status === 'picking') {
    return (
      <div className="stack">
        <p className="acrostic-prompt-banner">{state.round}판 · {state.difficulty?.name}</p>
        <p className="badge badge--info">
          선택 완료 {state.pickedParticipantIds.length}/{survivorCount}
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="operator-topbar__actions operator-topbar__actions--split">
          <button className="button" disabled={busy} onClick={() => run(reveal)}>
            정답 공개
          </button>
          <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
            게임 강제 리셋
          </button>
        </div>
      </div>
    );
  }

  // 결과
  const result = state.result;
  const wipeout = result?.outcome === 'wipeout';

  return (
    <motion.div
      className="stack"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springPop}
    >
      <p className="acrostic-prompt-banner">정답: {(state.answerSlot ?? 0) + 1}번</p>

      {wipeout ? (
        <p className="badge badge--info">아무도 못 맞혔습니다 — 무효로 하고 같은 인원으로 다시 합니다</p>
      ) : (
        <>
          <p className="chat__message--player" style={{ padding: 8, borderRadius: 8 }}>
            생존 ({result?.survivors.length ?? 0}명):{' '}
            {result?.survivors.map((s) => s.nickname).join(', ') || '없음'}
          </p>
          <p className="chat__message--operator" style={{ padding: 8, borderRadius: 8 }}>
            탈락 ({result?.eliminated.length ?? 0}명):{' '}
            {result?.eliminated.map((s) => s.nickname).join(', ') || '없음'}
          </p>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions operator-topbar__actions--split">
        <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
          게임 강제 리셋
        </button>
        <button className="button" disabled={busy} onClick={() => run(advance)}>
          {wipeout ? '확인 (다시 하기)' : '확인 (점수 반영)'}
        </button>
      </div>
    </motion.div>
  );
}
