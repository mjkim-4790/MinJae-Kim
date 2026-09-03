import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { STRICTNESS } from '../../lib/mugunghwa.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

const DOLL_MODES = [
  { id: 'operator', name: '내가 영희', desc: '진행자가 직접 돌아본다' },
  { id: 'random', name: '참가자 중 무작위', desc: '뽑힌 사람은 이번 판 주자에서 빠진다' },
];

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 2명 이상이어야 시작할 수 있습니다',
  NOT_ENOUGH_FOR_RANDOM_DOLL: '참가자 중 영희를 뽑으려면 3명 이상이어야 합니다',
  ROUND_IN_PROGRESS: '지금 라운드가 진행 중입니다',
  INVALID_STRICTNESS: '판정 강도를 선택하세요',
  NOT_RESULT: '아직 라운드 결과가 나오지 않았습니다',
  NOT_RUNNING: '진행 중인 라운드가 없습니다',
  NOT_DOLL: '영희만 조작할 수 있습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function MugunghwaOperatorPanel({ game, participants }) {
  const { state, start, prepare, unprepare, setLight, stop, advance, reset, serverTime } = game;
  const [dollMode, setDollMode] = useState('operator');
  const [strictness, setStrictness] = useState('normal');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const activeCount = participants.filter((p) => p.status === 'active').length;
  const activeIds = new Set(participants.filter((p) => p.status === 'active').map((p) => p.id));
  const readyCount = (state.readyIds ?? []).filter((id) => activeIds.has(id)).length;
  const notReady = Math.max(0, activeCount - readyCount);
  const survivorCount = state.runners?.length ?? 0;

  useEffect(() => {
    if (state.status !== 'sprinting') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 150);
    return () => clearInterval(id);
  }, [state.status]);

  // 패널을 펼치면 참가자 폰에 '움직임 감지 허용' 버튼이 뜬다 (미로와 같은 방식)
  const idle = state.status === 'idle';
  useEffect(() => {
    if (idle) prepare();
  }, [idle, prepare]);
  useEffect(() => () => { unprepare(); }, [unprepare]);

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  // 시작 전 / 라운드 사이
  if (state.status === 'idle' || state.status === 'ready' || state.status === 'ended') {
    const isNextRound = state.round > 0 && survivorCount > 1;
    // '참가자 중 무작위'는 영희가 주자에서 빠지므로 한 명이 더 필요하다
    const need = dollMode === 'random' ? 3 : 2;
    const have = isNextRound ? survivorCount : activeCount;
    const canStart = have >= need;
    // 버튼만 회색으로 막아두면 왜 안 되는지 알 수가 없다 (실제로 그렇게 막혀 있었다)
    const blockedReason = canStart
      ? null
      : dollMode === 'random'
        ? `참가자 중 영희를 뽑으려면 3명 이상이어야 합니다 (지금 ${have}명). 영희가 주자에서 빠지기 때문이에요 — '내가 영희'로 하면 2명부터 됩니다.`
        : `참여자가 2명 이상 입장해야 시작할 수 있습니다 (지금 ${have}명).`;

    return (
      <div className="stack">
        {state.status === 'ended' && (
          <>
            <motion.div className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
              🏆 최후의 1인: {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'} (
              {state.round}라운드)
            </motion.div>
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        {state.status !== 'ended' && isNextRound && (
          <p className="badge badge--info">
            {state.round}라운드 종료 · 남은 사람 {survivorCount}명
          </p>
        )}

        <p className="subtitle">
          폰을 <strong>흔들어야</strong> 앞으로 갑니다. 영희가 돌아봤을 때 움직이면 탈락이에요.
          누군가 영희를 터치하면 전원이 몸을 돌려 <strong>연타로</strong> 출발선까지 도망칩니다.
          시간 안에 돌아온 사람만 다음 라운드로 갑니다.
        </p>

        <label className="field">
          <span className="field__label">영희는 누가 하나요</span>
        </label>
        <ul className="typing-difficulty-grid">
          {DOLL_MODES.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${dollMode === m.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setDollMode(m.id)}
              >
                {m.name}
                <span className="maze-control-desc">{m.desc}</span>
              </button>
            </li>
          ))}
        </ul>

        <label className="field">
          <span className="field__label">움직임 판정</span>
        </label>
        <ul className="typing-difficulty-grid">
          {STRICTNESS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${strictness === s.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setStrictness(s.id)}
              >
                {s.name}
                <span className="maze-control-desc">{s.desc}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className={`subtitle${notReady > 0 ? ' maze-notready' : ''}`}>
          {activeCount === 0
            ? '참여자가 입장하면 각자 폰에서 움직임 감지를 허용하게 됩니다'
            : notReady > 0
              ? `움직임 허용: ${readyCount}/${activeCount}명 — ${notReady}명이 아직 안 눌렀습니다. 그대로 시작해도 되지만 그 분들은 움직일 수 없습니다.`
              : `움직임 허용: ${readyCount}/${activeCount}명 — 모두 준비됐습니다`}
        </p>

        {error && <p className="error-text">{error}</p>}
        {!error && blockedReason && <p className="subtitle mg-blocked">{blockedReason}</p>}

        <button
          className="button"
          disabled={busy || !canStart}
          onClick={() => run(start, { dollMode, strictness })}
        >
          {busy ? '시작하는 중…' : isNextRound ? `${state.round + 1}라운드 시작` : '시작하기'}
        </button>
      </div>
    );
  }

  // 진행 중
  if (state.status === 'approaching' || state.status === 'sprinting') {
    const msLeft = state.sprintEndsAt ? Math.max(0, state.sprintEndsAt - serverTime()) : 0;
    const caught = (state.runners ?? []).filter((r) => r.caught).length;
    const home = (state.runners ?? []).filter((r) => r.home).length;
    const iAmDoll = state.dollId == null;

    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.status === 'approaching'
            ? `${state.round}라운드 · 접근 중 · 잡힌 사람 ${caught}명`
            : `도망 중 · ${(msLeft / 1000).toFixed(1)}초 · 복귀 ${home}/${survivorCount}명`}
        </p>

        {iAmDoll && state.status === 'approaching' && (
          <>
            <p className={`mg-light ${state.green ? 'mg-light--green' : 'mg-light--red'}`}>
              {state.green ? '등을 돌린 중 — 다들 다가옵니다' : '돌아본 중 — 움직이면 잡힙니다'}
            </p>
            <motion.button
              className={`button mg-doll-btn${state.green ? ' mg-doll-btn--turn' : ''}`}
              disabled={busy}
              onClick={() => run(setLight, !state.green)}
              whileTap={{ scale: 0.96 }}
              transition={springTap}
            >
              {state.green ? '돌아보기!' : '다시 등 돌리기'}
            </motion.button>
            <p className="subtitle">
              등을 돌리면 대형화면에서 “무궁화 꽃이 피었습니다”가 나갑니다. 타이밍을 바꿔가며
              속이세요.
            </p>
          </>
        )}

        {!iAmDoll && (
          <p className="subtitle">
            영희: <strong>{state.doll?.nickname}</strong> — 그분 폰에서 돌아보기를 조작합니다.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="button button--ghost" disabled={busy} onClick={() => run(stop)}>
          지금 끝내고 결과 보기
        </button>
      </div>
    );
  }

  // 결과
  const wipeout = state.result?.outcome === 'wipeout';
  return (
    <div className="stack">
      <p className="badge badge--info">{state.round}라운드 결과</p>

      {wipeout ? (
        <p className="subtitle">아무도 출발선으로 돌아오지 못했습니다 — 같은 인원으로 다시 합니다.</p>
      ) : (
        <>
          <p className="chairs-op-line chairs-op-line--safe">
            생존 {state.result?.survivors?.length ?? 0}명:{' '}
            {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'}
          </p>
          <p className="chairs-op-line chairs-op-line--out">
            탈락 {state.result?.eliminated?.length ?? 0}명:{' '}
            {state.result?.eliminated?.map((e) => e.nickname).join(', ') || '없음'}
          </p>
          {state.result?.toucher && (
            <p className="subtitle">
              🌺 영희를 터치한 사람: <strong>{state.result.toucher.nickname}</strong> (보너스 50점)
            </p>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions operator-topbar__actions--split">
        <button className="button" disabled={busy} onClick={() => run(advance)}>
          {wipeout ? '다시 하기' : '다음으로'}
        </button>
        <button className="button button--danger" disabled={busy} onClick={() => run(reset)}>
          처음부터
        </button>
      </div>
    </div>
  );
}
