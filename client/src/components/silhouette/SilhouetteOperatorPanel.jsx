import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOBODY_CALLED: '먼저 참여자를 호출하세요',
  TURN_IN_PROGRESS: '지금 차례가 진행 중입니다',
  NOT_A_PARTICIPANT: '입장해 있는 참여자만 호출할 수 있습니다',
  NOT_PLAYING: '진행 중인 차례가 없습니다',
  NOT_RESULT: '아직 결과가 아닙니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  INVALID_POSE: '자세를 선택하세요',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

function levelLabel(t) {
  if (t <= 0.74) return '느슨';
  if (t >= 0.85) return '빡빡';
  return '보통';
}

export default function SilhouetteOperatorPanel({ game, participants }) {
  const { state, setup, leave, callPlayer, start, skip, next, end, reset } = game;
  const [poseId, setPoseId] = useState(null); // null = 무작위
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = participants.filter((p) => p.status === 'active');
  const done = new Set(state.doneIds ?? []);

  const idle = state.status === 'idle';
  useEffect(() => {
    if (idle) setup();
  }, [idle, setup]);
  useEffect(() => () => { leave(); }, [leave]);

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  if (state.status === 'ended') {
    return (
      <div className="stack">
        <motion.div className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
          🕺 {state.playedCount}명 도전 완료
        </motion.div>
        {state.ranking?.length > 0 ? (
          <ol className="maze-rank-list">
            {state.ranking.slice(0, 10).map((r, i) => (
              <li key={r.participantId} className="maze-rank-list__row">
                <span className="maze-rank-list__rank">{i + 1}</span>
                <span className="maze-rank-list__name">{r.nickname}</span>
                <span className="maze-rank-list__points">+{r.points}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="subtitle">기록이 없습니다.</p>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(reset)}>확인</button>
      </div>
    );
  }

  if (state.status === 'playing') {
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.currentNickname} 차례 · {state.pose?.name}
          {state.phase === 'ready' ? ' · 준비 중' : ` · ${Math.round((state.live?.match ?? 0) * 100)}%`}
        </p>
        <p className="subtitle">아이패드 화면에서 진행됩니다. 자세가 안 나오면 건너뛰세요.</p>
        {error && <p className="error-text">{error}</p>}
        <button className="button button--ghost" disabled={busy} onClick={() => run(skip)}>
          이 차례 건너뛰기
        </button>
      </div>
    );
  }

  if (state.status === 'result') {
    const r = state.lastResult;
    return (
      <div className="stack">
        <p className={`chairs-verdict ${r?.passed ? 'chairs-verdict--safe' : 'chairs-verdict--out'}`}>
          {r?.nickname} · {r?.poseName} · 최고 {r?.match}% {r?.passed ? `→ +${r.points}점` : '→ 실패'}
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="operator-topbar__actions operator-topbar__actions--split">
          <button className="button" disabled={busy} onClick={() => run(next)}>다음 사람</button>
          <button className="button button--danger" disabled={busy} onClick={() => run(end)}>게임 종료</button>
        </div>
      </div>
    );
  }

  const called = state.currentId != null;
  const blockedReason =
    active.length === 0 ? '참여자가 입장해야 진행할 수 있습니다 (지금 0명).'
    : !called ? '아래 명단에서 나올 사람을 눌러 호출하세요.'
    : null;

  return (
    <div className="stack">
      <p className="subtitle">
        아이패드 앞에 한 명씩 나와, 화면에 뜬 사람 모양을 몸으로 따라 합니다.
        자세 인식은 아이패드 안에서만 돌고 <strong>영상은 어디에도 저장·전송되지 않습니다</strong>
        (서버로는 관절 각도 숫자만 갑니다). <strong>전신이 보이게</strong> 아이패드를 멀찍이
        세워두세요.
      </p>
      <p className="subtitle">
        지금 난이도 <strong>{levelLabel(state.threshold)}</strong> (통과 기준{' '}
        {Math.round(state.threshold * 100)}%) — 성적에 따라 저절로 조절됩니다.
      </p>

      <label className="field"><span className="field__label">낼 자세</span></label>
      <ul className="typing-difficulty-grid">
        <li>
          <button
            type="button"
            className={`typing-difficulty-tile${poseId === null ? ' typing-difficulty-tile--active' : ''}`}
            onClick={() => setPoseId(null)}
          >
            무작위
          </button>
        </li>
        {(state.poseList ?? []).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`typing-difficulty-tile${poseId === p.id ? ' typing-difficulty-tile--active' : ''}`}
              onClick={() => setPoseId(p.id)}
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>

      <label className="field">
        <span className="field__label">
          나올 사람 호출 {state.playedCount > 0 && `· ${state.playedCount}명 완료`}
        </span>
      </label>
      {active.length === 0 ? (
        <p className="subtitle">아직 입장한 참여자가 없습니다.</p>
      ) : (
        <ul className="lr-queue">
          {active.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`lr-queue__name${state.currentId === p.id ? ' lr-queue__name--called' : ''}${done.has(p.id) ? ' lr-queue__name--done' : ''}`}
                disabled={busy}
                onClick={() => run(callPlayer, p.id)}
              >
                {p.nickname}
                {done.has(p.id) && <span className="lr-queue__done">완료</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error-text">{error}</p>}
      {!error && blockedReason && <p className="subtitle mg-blocked">{blockedReason}</p>}

      <button
        className="button"
        disabled={busy || !called}
        onClick={() => run(start, poseId ? { poseId } : {})}
      >
        {called ? `${state.currentNickname} 시작` : '시작'}
      </button>

      {state.playedCount > 0 && (
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>
          게임 종료
        </button>
      )}
    </div>
  );
}
