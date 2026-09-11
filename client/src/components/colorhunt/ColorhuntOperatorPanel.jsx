import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 입장해야 출제할 수 있습니다',
  ROUND_IN_PROGRESS: '지금 라운드가 진행 중입니다',
  INVALID_COLOR: '색을 선택하세요',
  NOT_HUNTING: '진행 중인 라운드가 없습니다',
  NOT_RUNNING: '아직 시작하지 않았습니다',
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  FORBIDDEN: '권한이 없습니다',
};

// 난이도 배율을 사람 말로 바꾼다. 진행자에게 "1.2"는 아무 뜻이 없다.
function toleranceLabel(k) {
  if (k <= 0.8) return '빡빡함';
  if (k >= 1.2) return '헐거움';
  return '보통';
}

export default function ColorhuntOperatorPanel({ game, participants }) {
  const { state, ask, close, end, reset, prepare, unprepare } = game;
  const [colorId, setColorId] = useState(null); // null = 무작위
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const activeIds = new Set(participants.filter((p) => p.status === 'active').map((p) => p.id));
  const activeCount = activeIds.size;
  const readyCount = (state.readyIds ?? []).filter((id) => activeIds.has(id)).length;
  const notReady = Math.max(0, activeCount - readyCount);

  // 이 패널을 펼쳐두면 참여자 폰에 '카메라 켜기'가 뜬다. 출제한 뒤에 권한 팝업을
  // 띄우게 하면 그 사람만 한참 늦는다. 다른 게임으로 넘어가면 치운다.
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

  const palette = state.palette ?? [];

  // ── 사냥 중 ──
  if (state.status === 'hunting') {
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.round}라운드 · <strong>{state.target?.name}</strong> 찾는 중 · 통과{' '}
          {state.passedCount}/{state.submittedCount}명 제출
        </p>
        <p className="subtitle">
          난이도 {toleranceLabel(state.tolerance)} · 참여자는 통과할 때까지 다시 찍을 수 있습니다
          (빨리 맞힐수록 점수가 높습니다).
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(close)}>
          마감하고 결과 보기
        </button>
      </div>
    );
  }

  // ── 종료 ──
  if (state.status === 'ended') {
    return (
      <div className="stack">
        <motion.div className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
          🎨 {state.roundCount}라운드 종료
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
        <button className="button" disabled={busy} onClick={() => run(reset)}>
          확인
        </button>
      </div>
    );
  }

  // ── 대기 / 라운드 사이 ──
  const last = state.lastRound;
  const blockedReason = activeCount === 0 ? '참여자가 입장해야 출제할 수 있습니다 (지금 0명).' : null;

  return (
    <div className="stack">
      {state.status === 'closed' && last && (
        <div className="ch-lastround stack">
          <p className="badge badge--info">
            {last.round}라운드 <strong>{last.targetName}</strong> · 통과 {last.passed}/{last.submitted}명
          </p>
          {last.firstAttemptFailRate != null && (
            <p className="subtitle">
              첫 시도에 맞힌 사람 {Math.round((1 - last.firstAttemptFailRate) * 100)}% → 다음 라운드
              난이도 <strong>{toleranceLabel(state.tolerance)}</strong>
              {' '}(너무 쉬우면 조이고, 너무 어려우면 풉니다)
            </p>
          )}
        </div>
      )}

      <p className="subtitle">
        진행자가 색을 부르면 참여자가 주변에서 그 색 물건을 찾아 폰 카메라로 찍습니다.
        <strong> 사진은 저장되거나 전송되지 않고</strong>, 폰 안에서 색만 뽑아 보냅니다
        (현재 참여자 {activeCount}명).
      </p>

      <label className="field">
        <span className="field__label">출제할 색</span>
      </label>
      <ul className="ch-palette">
        <li>
          <button
            type="button"
            className={`ch-swatch ch-swatch--random${colorId === null ? ' ch-swatch--active' : ''}`}
            onClick={() => setColorId(null)}
          >
            <span className="ch-swatch__name">무작위</span>
          </button>
        </li>
        {palette.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`ch-swatch${colorId === c.id ? ' ch-swatch--active' : ''}`}
              onClick={() => setColorId(c.id)}
            >
              <span className="ch-swatch__chip" style={{ background: c.swatch }} />
              <span className="ch-swatch__name">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className={`subtitle${notReady > 0 ? ' maze-notready' : ''}`}>
        {activeCount === 0
          ? '참여자가 입장하면 각자 폰에서 카메라 켜기를 누르게 됩니다'
          : notReady > 0
            ? `카메라 허용: ${readyCount}/${activeCount}명 — ${notReady}명이 아직 안 눌렀습니다. 그대로 출제해도 되지만 그분들은 출발이 늦어집니다.`
            : `카메라 허용: ${readyCount}/${activeCount}명 — 모두 준비됐습니다`}
      </p>

      {error && <p className="error-text">{error}</p>}
      {/* 버튼이 꺼져 있으면 왜 꺼졌는지 항상 적는다 — 조용히 막히면 진행이 멈춘다 */}
      {!error && blockedReason && <p className="subtitle mg-blocked">{blockedReason}</p>}

      <button
        className="button"
        disabled={busy || activeCount === 0}
        onClick={() => run(ask, colorId ? { colorId } : {})}
      >
        {busy ? '출제하는 중…' : state.roundCount > 0 ? '다음 색 출제' : '출제하기'}
      </button>

      {state.roundCount > 0 && (
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>
          게임 종료
        </button>
      )}
    </div>
  );
}
