import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOBODY_CALLED: '먼저 참여자를 호출하세요',
  NO_CHART: '아이패드에서 노래를 먼저 고르세요',
  TURN_IN_PROGRESS: '지금 한 판이 진행 중입니다',
  NOT_A_PARTICIPANT: '입장해 있는 참여자만 호출할 수 있습니다',
  NOT_RESULT: '아직 결과가 나오지 않았습니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function FruitOperatorPanel({ game, participants }) {
  const { state, setup, leave, callPlayer, start, next, end, reset } = game;
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
          🍉 {state.doneCount}명 도전
        </motion.div>
        {state.ranking?.length > 0 && (
          <ol className="stack">
            {state.ranking.slice(0, 5).map((r) => (
              <li key={r.participantId} className="subtitle">{r.nickname} — {r.points}점</li>
            ))}
          </ol>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(reset)}>확인</button>
      </div>
    );
  }

  if (state.status === 'playing') {
    return (
      <div className="stack">
        <p className="badge badge--info">{state.currentNickname} 진행 중</p>
        <p className="subtitle">
          노래가 끝나면 저절로 결과가 나옵니다. 중간에 끊어야 하면 아래를 누르세요.
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button button--danger" disabled={busy} onClick={() => run(game.finish)}>
          지금 끝내기
        </button>
      </div>
    );
  }

  if (state.status === 'result') {
    const r = state.lastResult;
    return (
      <div className="stack">
        <motion.div className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
          {r?.nickname} — {r?.score}점
        </motion.div>
        <p className="subtitle">
          {r?.sliced}/{r?.total}개 · 최고 {r?.maxCombo}콤보{r?.bombs > 0 ? ` · 폭탄 ${r.bombs}번` : ''}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(next)}>다음 사람</button>
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>종료</button>
      </div>
    );
  }

  const called = state.currentId != null;
  const blockedReason =
    !state.hasChart ? '아이패드에서 노래를 먼저 고르세요. 고르면 박자를 분석합니다.'
    : active.length === 0 ? '참여자가 입장해야 진행할 수 있습니다 (지금 0명).'
    : !called ? '아래 명단에서 나올 사람을 눌러 호출하세요.'
    : null;

  return (
    <div className="stack">
      <p className="subtitle">
        아이패드 앞에 한 명씩 서서 <strong>손을 휘둘러</strong> 노래 박자에 맞춰 날아오는
        과일을 자릅니다. 음악·과일·판정이 전부 아이패드 한 대에서 돌아가서 박자가 어긋나지
        않습니다. 얼굴은 화면에 뜨지 않고, 손끝이 지나간 자국만 보입니다.
      </p>
      <p className="subtitle mg-blocked">
        노래 파일은 <strong>아이패드에서 직접 고르고</strong> 그 안에서만 재생·분석됩니다 —
        서버로 가는 건 박자 시각표(숫자)뿐입니다.
      </p>

      {state.hasChart && (
        <p className="badge badge--info">
          🎵 {state.songName ?? '노래'} · {state.bpm ?? '?'} BPM · 과일 {state.chartLength}개
        </p>
      )}

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

      <button className="button" disabled={busy || !called || !state.hasChart} onClick={() => run(start)}>
        {called ? `${state.currentNickname} 시작` : '시작'}
      </button>

      {state.doneCount > 0 && (
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>종료</button>
      )}
    </div>
  );
}
