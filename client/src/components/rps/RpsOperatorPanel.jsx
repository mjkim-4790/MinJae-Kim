import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import HourglassAnimation from './HourglassAnimation.jsx';
import { HandIcon } from './HandIcons.jsx';
import { springPop, springTap } from '../../lib/motionPresets.js';
import { CHOICE_META, CHOICES } from '../../lib/rps.js';

const ERROR_MESSAGE = {
  INVALID_TARGET: '목표 승자 수를 확인하세요 (1 ~ 현재 참여자 수)',
  GAME_IN_PROGRESS: '이미 게임이 진행 중입니다. 먼저 리셋하세요',
  NOT_SELECTING: '지금은 선택 단계가 아닙니다',
  NOT_LOCKED: '지금은 운영자 선택 단계가 아닙니다',
  NOT_RESULT: '지금은 결과 단계가 아닙니다',
};

function nicknameOf(participantsById, id) {
  return participantsById.get(id)?.nickname ?? `#${id}`;
}

function TimerBadge({ timerEndsAt }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!timerEndsAt) {
      setRemaining(null);
      return undefined;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timerEndsAt]);

  if (remaining === null) return null;
  return <span className="badge badge--info">⏳ {remaining}초</span>;
}

export default function RpsOperatorPanel({ game, participants, activeParticipantCount }) {
  const { state, start, startTimer, lock, confirm, advance, restartRound, reset } = game;
  const [target, setTarget] = useState(1);
  const [operatorPick, setOperatorPick] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(15);
  const [timerDecorative, setTimerDecorative] = useState(false);

  const participantsById = new Map(participants.map((p) => [p.id, p]));

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
        {state.status === 'ended' && state.finalWinners && (
          <motion.div
            className="rps-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 최종 승자: {state.finalWinners.map((w) => w.nickname).join(', ')}
          </motion.div>
        )}
        <label className="field">
          <span className="field__label">목표 승자 수 (현재 참여자 {activeParticipantCount}명)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={activeParticipantCount}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button
          className="button"
          disabled={busy || activeParticipantCount === 0}
          onClick={() => run(start, target)}
        >
          게임 시작
        </button>
      </div>
    );
  }

  const activeNicknames = state.activeParticipantIds.map((id) => nicknameOf(participantsById, id));
  const chosenCount = state.chosenParticipantIds.length;

  return (
    <div className="stack">
      <p className="subtitle">
        라운드 {state.round} · 목표 {state.targetWinners}명 · 확정 {state.confirmedWinnerIds.length}명 ·
        이번 라운드 참여 {state.activeParticipantIds.length}명
      </p>
      <p className="subtitle">참여자: {activeNicknames.join(', ') || '없음'}</p>

      <AnimatePresence mode="wait">
        {state.status === 'selecting' && (
          <motion.div
            key="selecting"
            className="stack"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            <p>
              선택 완료 {chosenCount}/{state.activeParticipantIds.length}
              {' '}
              <TimerBadge timerEndsAt={state.timerEndsAt} />
            </p>
            {state.timerDecorative && state.timerEndsAt && (
              <motion.div
                style={{ display: 'flex', justifyContent: 'center' }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springPop}
              >
                <HourglassAnimation size={56} />
              </motion.div>
            )}
            <div className="operator-topbar__actions">
              <label className="field" style={{ width: 88 }}>
                <span className="field__label">초</span>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={120}
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Number(e.target.value))}
                />
              </label>
              <label className="chat__toggle">
                <input
                  type="checkbox"
                  checked={timerDecorative}
                  onChange={(e) => setTimerDecorative(e.target.checked)}
                />
                장식 애니메이션
              </label>
              <button
                className="button button--ghost"
                disabled={busy}
                onClick={() => run(startTimer, timerSeconds, timerDecorative)}
              >
                모래시계 시작
              </button>
              <button className="button" disabled={busy} onClick={() => run(lock)}>
                마감
              </button>
            </div>
          </motion.div>
        )}

        {state.status === 'locked' && (
          <motion.div
            key="locked"
            className="stack"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            <p className="badge badge--info">참여자 입력 잠김 — 두구두구…</p>
            <div className="rps-choice-row">
              {CHOICES.map((c) => (
                <motion.button
                  key={c}
                  className={`rps-choice-btn ${operatorPick === c ? 'rps-choice-btn--active' : ''}`}
                  onClick={() => setOperatorPick(c)}
                  whileTap={{ scale: 0.92 }}
                  transition={springTap}
                >
                  <HandIcon choice={c} size={40} />
                  {CHOICE_META[c].label}
                </motion.button>
              ))}
            </div>
            <button
              className="button"
              disabled={busy || !operatorPick}
              onClick={async () => {
                const res = await run(confirm, operatorPick);
                if (res?.ok) setOperatorPick(null);
              }}
            >
              확인
            </button>
          </motion.div>
        )}

        {state.status === 'result' && state.roundResult && (
          <motion.div
            key="result"
            className="stack"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            <p className="rps-inline">
              MC 의 선택: <HandIcon choice={state.operatorChoice} size={28} /> {CHOICE_META[state.operatorChoice].label}
            </p>
            <p className="chat__message--player" style={{ padding: 8, borderRadius: 8 }}>
              생존: {state.roundResult.winners.map((w) => w.nickname).join(', ') || '없음'}
            </p>
            <p className="chat__message--operator" style={{ padding: 8, borderRadius: 8 }}>
              탈락: {state.roundResult.nonWinners.map((w) => w.nickname).join(', ') || '없음'}
            </p>
            <div className="operator-topbar__actions">
              <button className="button button--ghost" disabled={busy} onClick={() => run(restartRound)}>
                다시 시작
              </button>
              <button className="button" disabled={busy} onClick={() => run(advance)}>
                다음
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="error-text">{error}</p>}

      <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
        게임 강제 리셋
      </button>
    </div>
  );
}
