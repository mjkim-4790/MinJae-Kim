import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOBODY_CALLED: '먼저 참여자를 호출하세요',
  TURN_IN_PROGRESS: '지금 차례가 진행 중입니다',
  NOT_A_PARTICIPANT: '입장해 있는 참여자만 호출할 수 있습니다',
  NOT_ACTIVE: '진행 중인 차례가 없습니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function OutfitOperatorPanel({ game, participants }) {
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
          👕 {state.doneCount}명 완료
        </motion.div>
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(reset)}>확인</button>
      </div>
    );
  }

  if (state.status === 'active' || (state.status === 'ready' && state.currentId != null)) {
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.currentNickname} · 옷 {state.outfitCount}/{state.maxOutfits}벌 올림
        </p>
        <p className="subtitle">
          아이패드 화면에서 실시간으로 겹쳐 보입니다. <strong>정면으로 서 있을 때</strong> 가장
          잘 보여요 — 몸을 돌리거나 팔을 크게 움직이면 옷이 따라가지 못합니다.
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(next)}>
          다음 사람
        </button>
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
        게임이 아니라 쉬어가는 코너입니다. 점수도 판정도 없어요.
        호출된 사람이 <strong>폰에서 옷 사진을 올리면</strong>, 아이패드 카메라 앞에서
        <strong> 실시간으로 몸에 겹쳐</strong> 보여줍니다. 여러 벌 올려두고 아이패드에서
        눌러가며 갈아입을 수 있어요.
      </p>
      <p className="subtitle mg-blocked">
        평면 사진을 몸 크기·기울기에 맞추는 정도라 주름이나 소매 움직임까지는
        재현되지 않습니다. 정면으로 서면 가장 자연스럽습니다.
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
