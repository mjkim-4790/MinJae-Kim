import { useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 2명 이상이어야 시작할 수 있습니다',
  ROUND_IN_PROGRESS: '지금 라운드가 진행 중입니다',
  NOT_RESULT: '아직 라운드 결과가 나오지 않았습니다',
  FORBIDDEN: '권한이 없습니다',
};

export default function ChairsOperatorPanel({ game, participants }) {
  const { state, start, advance, reset } = game;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeCount = participants.filter((p) => p.status === 'active').length;
  const survivorCount = state.players.length;

  const run = async (action, ...args) => {
    setBusy(true);
    setError(null);
    const res = await action(...args);
    if (!res?.ok) setError(ERROR_MESSAGE[res?.error] ?? '요청에 실패했습니다');
    setBusy(false);
    return res;
  };

  // 시작 전 / 라운드 사이
  if (state.status === 'idle' || state.status === 'ended') {
    const isNextRound = state.round > 0 && survivorCount > 1;
    const canStart = isNextRound ? survivorCount >= 2 : activeCount >= 2;

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

        {state.status === 'idle' && isNextRound && (
          <p className="badge badge--info">
            {state.round}라운드 종료 · 생존 {survivorCount}명 — 다음 라운드는 의자{' '}
            {Math.max(1, survivorCount - 1)}개
          </p>
        )}

        <p className="subtitle">
          닉네임이 원을 돌다가 호루라기가 울리면, 참여자가 자기 <strong>양옆 의자</strong>를 눌러
          자리를 잡습니다. 의자는 늘 한 자리가 모자라 매 라운드 탈락자가 나오고, 최후의 1인이
          남으면 끝납니다 (현재 참여자 {isNextRound ? survivorCount : activeCount}명).
        </p>

        <p className="subtitle">
          호루라기는 시작 후 <strong>5~15초 사이 무작위</strong>로 울립니다. 대형화면에서
          <strong> 소리 켜기</strong>를 한 번 눌러두세요 — 브라우저 정책상 클릭이 있어야 소리가
          납니다.
        </p>

        {error && <p className="error-text">{error}</p>}
        {!canStart && (
          <p className="subtitle">참여자가 2명 이상 입장해야 시작할 수 있습니다.</p>
        )}

        <button className="button" disabled={busy || !canStart} onClick={() => run(start)}>
          {busy ? '시작하는 중…' : isNextRound ? `${state.round + 1}라운드 시작` : '시작하기'}
        </button>
      </div>
    );
  }

  if (state.status === 'spinning') {
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.round}라운드 · 돌고 있습니다 · 의자 {state.chairCount}개 / {survivorCount}명
        </p>
        <p className="subtitle">호루라기는 곧 자동으로 울립니다. 기다려주세요.</p>
      </div>
    );
  }

  if (state.status === 'grabbing') {
    return (
      <div className="stack">
        <p className="badge badge--info">
          🔔 앉는 중! · {state.taken.length}/{state.chairCount}자리 참
        </p>
        <ul className="chairs-op-list">
          {state.taken.map((t) => (
            <li key={t.chairIndex}>
              {t.chairIndex + 1}번 — {t.nickname}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // result
  const wipeout = state.result?.outcome === 'wipeout';
  return (
    <div className="stack">
      <p className="badge badge--info">{state.round}라운드 결과</p>

      {wipeout ? (
        <p className="subtitle">아무도 앉지 않았습니다 — 같은 인원으로 다시 합니다.</p>
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
