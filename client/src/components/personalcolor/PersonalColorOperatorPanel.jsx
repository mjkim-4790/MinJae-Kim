import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOBODY_CALLED: '먼저 참여자를 호출하세요',
  TURN_IN_PROGRESS: '지금 차례가 진행 중입니다',
  NOT_A_PARTICIPANT: '입장해 있는 참여자만 호출할 수 있습니다',
  NOT_ACTIVE: '진행 중인 차례가 없습니다',
  NOT_RESULT: '아직 결과가 아닙니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function PersonalColorOperatorPanel({ game, participants }) {
  const { state, setup, leave, callPlayer, start, skip, next, end, reset } = game;
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
          🎨 {state.doneCount}명 완료
        </motion.div>
        {state.tally?.length > 0 ? (
          <ul className="maze-rank-list">
            {state.tally.map((t) => (
              <li key={t.id} className="maze-rank-list__row">
                <span className="maze-rank-list__name">{t.name}</span>
                <span className="maze-rank-list__points">{t.count}명</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="subtitle">기록이 없습니다.</p>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(reset)}>확인</button>
      </div>
    );
  }

  if (state.status === 'active') {
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.currentNickname} · {state.step + 1}/{state.total}번째 비교
        </p>
        <p className="subtitle">
          아이패드에서 본인이 직접 고릅니다. 얼굴이 화면 동그라미에 들어오게 서 있으면 돼요.
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button button--ghost" disabled={busy} onClick={() => run(skip)}>
          지금까지로 결과 보기
        </button>
      </div>
    );
  }

  if (state.status === 'result') {
    const r = state.lastResult;
    return (
      <div className="stack">
        <p className="chairs-verdict chairs-verdict--safe">
          {r?.nickname} · <strong>{r?.typeName}</strong>
        </p>
        <p className="subtitle">{r?.desc}</p>
        <ul className="pc-palette pc-palette--small">
          {(r?.palette ?? []).map((c) => (
            <li key={c} className="pc-palette__chip" style={{ background: c }} />
          ))}
        </ul>
        <p className="subtitle">판정 근거: {(r?.reason ?? []).join(' · ')}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="operator-topbar__actions operator-topbar__actions--split">
          <button className="button" disabled={busy} onClick={() => run(next)}>다음 사람</button>
          <button className="button button--danger" disabled={busy} onClick={() => run(end)}>종료</button>
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
        게임이 아니라 쉬어가는 코너입니다. 점수도 승패도 없어요.
        아이패드 앞에 한 명씩 나와 <strong>자기 얼굴을 보면서</strong> 얼굴 옆에 색을 대보고,
        두 색 중 나은 쪽을 본인이 고릅니다. 다섯 번 고르면 8유형 중 하나가 나옵니다.
      </p>
      <p className="subtitle">
        <strong>사진을 찍거나 저장하지 않습니다.</strong> 화면에 보이는 건 실시간 미리보기뿐이고,
        서버로 가는 건 고른 쪽과 피부톤 색 하나뿐이에요.
      </p>
      <p className="subtitle mg-blocked">
        전문 진단이 아닙니다 — 행사장 조명에 따라 결과가 달라질 수 있으니 재미로만 봐주세요.
      </p>

      <label className="field">
        <span className="field__label">
          나올 사람 호출 {state.doneCount > 0 && `· ${state.doneCount}명 완료`}
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

      {state.doneCount > 0 && (
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>
          종료
        </button>
      )}
    </div>
  );
}
