import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { DIFFICULTIES, HAND_EMOJI } from '../../lib/laterps.js';
import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOBODY_CALLED: '먼저 참여자를 호출하세요',
  TURN_IN_PROGRESS: '지금 차례가 진행 중입니다',
  NOT_A_PARTICIPANT: '입장해 있는 참여자만 호출할 수 있습니다',
  NOT_PLAYING: '진행 중인 차례가 없습니다',
  NOT_RESULT: '아직 결과가 아닙니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  INVALID_DIFFICULTY: '난이도를 선택하세요',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function LaterpsOperatorPanel({ game, participants }) {
  const { state, setup, leave, callPlayer, start, skip, next, end, reset } = game;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = participants.filter((p) => p.status === 'active');
  const done = new Set(state.doneIds ?? []);

  // 패널을 펼치면 아이패드 화면이 이 게임으로 바뀐다. 다른 게임으로 넘어가면 치운다.
  const idle = state.status === 'idle';
  useEffect(() => {
    if (idle) setup({ difficultyId: state.difficultyId });
  }, [idle, setup, state.difficultyId]);
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
          ✌️ {state.playedCount}명 도전 완료
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
    const t = state.turn;
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.currentNickname} 차례 · {(t?.index ?? 0) + 1}/{t?.total ?? 1}
          {t?.phase === 'ready' && ' · 준비 중'}
          {t?.phase === 'reveal' && ' · 손 내는 중'}
          {t?.phase === 'answer' && ' · 받는 중'}
        </p>
        <p className="subtitle">아이패드 화면에서 진행됩니다. 손을 못 내면 건너뛰세요.</p>
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
        <p className="badge badge--info">{r?.nickname} · +{r?.points ?? 0}점</p>
        <ul className="lr-beats lr-beats--compact">
          {(r?.beats ?? []).map((b, i) => (
            <li key={i} className={`lr-beat${b.correct ? ' lr-beat--ok' : ''}`}>
              <span className="lr-beat__hand">{HAND_EMOJI[b.hand]}</span>
              <span className="lr-beat__order">{b.instruction === 'win' ? '이겨' : '져'}</span>
              <span className="lr-beat__arrow">→</span>
              <span className="lr-beat__answer">{b.answered ? HAND_EMOJI[b.answered] : '무응답'}</span>
              <span className="lr-beat__mark">{b.correct ? '⭕' : '❌'}</span>
            </li>
          ))}
        </ul>
        {error && <p className="error-text">{error}</p>}
        <div className="operator-topbar__actions operator-topbar__actions--split">
          <button className="button" disabled={busy} onClick={() => run(next)}>다음 사람</button>
          <button className="button button--danger" disabled={busy} onClick={() => run(end)}>게임 종료</button>
        </div>
      </div>
    );
  }

  // ── 대기 (idle / ready) ──
  const called = state.currentId != null;
  const blockedReason =
    active.length === 0 ? '참여자가 입장해야 진행할 수 있습니다 (지금 0명).'
    : !called ? '아래 명단에서 나올 사람을 눌러 호출하세요.'
    : null;

  return (
    <div className="stack">
      <p className="subtitle">
        아이패드 한 대 앞에 한 줄로 서서 한 명씩 합니다. 화면 속 캐릭터가 손을 먼저 내고
        <strong> 이겨/져 </strong>지시가 뜨면 그대로 손을 내밀면 됩니다.
        손 인식은 아이패드 안에서만 돌고 <strong>영상은 어디에도 저장·전송되지 않습니다</strong>.
      </p>

      <label className="field"><span className="field__label">난이도</span></label>
      <ul className="typing-difficulty-grid">
        {DIFFICULTIES.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className={`typing-difficulty-tile${state.difficultyId === d.id ? ' typing-difficulty-tile--active' : ''}`}
              disabled={busy}
              onClick={() => run(setup, { difficultyId: d.id })}
            >
              {d.name}
              <span className="maze-control-desc">{d.desc}</span>
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

      <button className="button" disabled={busy || !called} onClick={() => run(start)}>
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
