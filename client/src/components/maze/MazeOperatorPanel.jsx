import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const DIFFICULTIES = [
  { id: 'normal', name: '보통', desc: '벽에 부딪히면 멈춘다', timed: true },
  { id: 'hard', name: '상', desc: '벽에 닿으면 처음으로 · 점수 1.5배', timed: false },
];

const CONTROLS = [
  { id: 'tilt', name: '기울기', desc: '폰을 기울여 굴린다' },
  { id: 'buttons', name: '버튼', desc: '화면 방향 버튼으로 굴린다' },
];
const LIMITS = [60, 90, 120];

const ERROR_MESSAGE = {
  NOT_ENOUGH_PARTICIPANTS: '참여자가 입장해야 시작할 수 있습니다',
  RACE_IN_PROGRESS: '지금 경기가 진행 중입니다',
  INVALID_DIFFICULTY: '난이도를 선택하세요',
  INVALID_CONTROL: '조작 방식을 선택하세요',
  INVALID_LIMIT: '제한시간을 선택하세요',
  NOT_FINISHED: '아직 경기가 끝나지 않았습니다',
  NOT_RESULT: '결과를 먼저 공개하세요',
  FORBIDDEN: '권한이 없습니다',
};

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(2)}초`;
}

export default function MazeOperatorPanel({ game, participants }) {
  const { state, serverTime, start, reveal, end, reset, prepare, unprepare } = game;
  const [difficulty, setDifficulty] = useState('normal');
  const [control, setControl] = useState('tilt');
  const [limitSec, setLimitSec] = useState(90);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const activeCount = participants.filter((p) => p.status === 'active').length;
  const timed = DIFFICULTIES.find((d) => d.id === difficulty)?.timed ?? true;
  // 기울기 허용을 마친 사람 (지금 입장해 있는 사람 기준으로만 센다)
  const activeIds = new Set(participants.filter((p) => p.status === 'active').map((p) => p.id));
  const readyCount = (state.readyIds ?? []).filter((id) => activeIds.has(id)).length;
  const notReady = Math.max(0, activeCount - readyCount);

  useEffect(() => {
    if (state.status !== 'countdown' && state.status !== 'racing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [state.status]);

  // 이 패널을 펼쳐두면 참여자 폰에 '기울기 허용' 버튼이 뜬다.
  // 시작을 누른 뒤에 허용하게 하면 카운트다운 3초 안에 팝업까지 처리해야 해서 늦는다.
  // 다른 게임으로 넘어가면(언마운트) 참여자 화면에서도 치운다.
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

  if (state.status === 'idle' || state.status === 'ready' || state.status === 'ended') {
    return (
      <div className="stack">
        {state.status === 'ended' && state.ranking && (
          <>
            <motion.div className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
              🏁 1등{' '}
              {state.ranking[0]
                ? `${state.ranking[0].nickname} · ${
                    state.rankedBy === 'progress'
                      ? `${state.ranking[0].remaining}칸 남음`
                      : formatElapsed(state.ranking[0].elapsedMs)
                  }`
                : '없음'}
            </motion.div>
            <button className="button" disabled={busy} onClick={() => run(reset)}>
              확인
            </button>
          </>
        )}

        <p className="subtitle">
          공을 굴려 미로를 빠져나가는 게임입니다. 미리 만들어둔 미로 20개 중 하나가 무작위로
          나오고, 빨리 도착한 순서로 순위를 매깁니다 (현재 참여자 {activeCount}명).
        </p>

        <label className="field">
          <span className="field__label">난이도</span>
        </label>
        <ul className="typing-difficulty-grid">
          {DIFFICULTIES.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${difficulty === d.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setDifficulty(d.id)}
              >
                {d.name}
                <span className="maze-control-desc">{d.desc}</span>
              </button>
            </li>
          ))}
        </ul>
        {difficulty === 'hard' && (
          <p className="subtitle">
            벽에 <strong>스치기만 해도</strong> 출발점으로 돌아갑니다. 대신 미로가 조금 작고
            통로도 넓습니다. <strong>제한시간 없이</strong> 달리다가 한 명이 통과하면 그 자리에서
            끝납니다. 아무도 못 끝내면 진행자가 '지금 끝내고 결과 보기'를 누르면 되고, 그때는
            가장 멀리 간 순으로 순위를 매깁니다.
          </p>
        )}

        <label className="field">
          <span className="field__label">조작 방식 — 모두 같은 조건으로 진행됩니다</span>
        </label>
        <ul className="typing-difficulty-grid">
          {CONTROLS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`typing-difficulty-tile${control === c.id ? ' typing-difficulty-tile--active' : ''}`}
                onClick={() => setControl(c.id)}
              >
                {c.name}
                <span className="maze-control-desc">{c.desc}</span>
              </button>
            </li>
          ))}
        </ul>
        {control === 'tilt' && (
          <p className="subtitle">
            기울기는 아이폰에서 참여자가 <strong>허용 버튼</strong>을 눌러야 켜지고, 노트북·PC는
            센서가 없어 참여할 수 없습니다. 그런 분이 있으면 버튼 조작으로 진행하세요.
          </p>
        )}

        {timed ? (
          <>
            <label className="field">
              <span className="field__label">제한시간</span>
            </label>
            <ul className="typing-difficulty-grid">
              {LIMITS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className={`typing-difficulty-tile${limitSec === s ? ' typing-difficulty-tile--active' : ''}`}
                    onClick={() => setLimitSec(s)}
                  >
                    {s}초
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="badge badge--info">제한시간 없음 · 1등이 나오면 종료</p>
        )}

        {error && <p className="error-text">{error}</p>}

        {control === 'tilt' && (
          <p className={`subtitle${notReady > 0 ? ' maze-notready' : ''}`}>
            {notReady > 0
              ? `기울기 허용: ${readyCount}/${activeCount}명 — ${notReady}명이 아직 안 눌렀습니다. 그대로 시작해도 되지만, 그 분들은 출발이 늦어집니다.`
              : activeCount > 0
                ? `기울기 허용: ${readyCount}/${activeCount}명 — 모두 준비됐습니다`
                : '참여자가 입장하면 각자 폰에서 기울기 허용을 누르게 됩니다'}
          </p>
        )}

        <button
          className="button"
          disabled={busy || activeCount === 0}
          onClick={() => run(start, { difficulty, control, limitSec })}
        >
          {busy ? '시작하는 중…' : '시작하기 (3초 뒤 출발)'}
        </button>
      </div>
    );
  }

  const finishedCount = state.finishedParticipantIds.length;
  const entrants = state.activeParticipantIds.length;

  if (state.status === 'countdown' || state.status === 'racing') {
    const msLeft = state.endsAt ? Math.max(0, state.endsAt - serverTime()) : 0;
    const countdownLeft = state.startsAt ? Math.max(0, state.startsAt - serverTime()) : 0;
    return (
      <div className="stack">
        <p className="badge badge--info">
          {state.status === 'countdown'
            ? `출발까지 ${Math.max(1, Math.ceil(countdownLeft / 1000))}초`
            : state.endsAt
              ? `${Math.ceil(msLeft / 1000)}초 남음 · 완주 ${finishedCount}/${entrants}명`
              : `진행 중 · 1등이 나오면 종료 (${entrants}명)`}
        </p>
        <p className="subtitle">
          {state.difficulty === 'hard' ? '난이도 상' : '보통'} ·{' '}
          {state.control === 'tilt' ? '기울기' : '버튼'} 조작 ·{' '}
          {state.endsAt ? `제한시간 ${state.limitMs / 1000}초` : '제한시간 없음'}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="button button--ghost" disabled={busy} onClick={() => run(reveal)}>
          지금 끝내고 결과 보기
        </button>
      </div>
    );
  }

  if (state.status === 'finished') {
    return (
      <div className="stack">
        <p className="badge badge--info">경기 종료 · 완주 {finishedCount}/{entrants}명</p>
        {error && <p className="error-text">{error}</p>}
        <button className="button" disabled={busy} onClick={() => run(reveal)}>
          결과 보기
        </button>
      </div>
    );
  }

  // result
  return (
    <div className="stack">
      <p className="badge badge--info">
        {state.rankedBy === 'progress'
          ? `완주자 없음 — 진출 거리 순위 (참가 ${entrants}명)`
          : `결과 공개됨 · 완주 ${state.ranking?.length ?? 0}/${entrants}명`}
      </p>

      {state.ranking?.length > 0 ? (
        <ol className="maze-rank-list">
          {state.ranking.map((r) => (
            <li key={r.participantId} className="maze-rank-list__row">
              <span className="maze-rank-list__rank">{r.rank}</span>
              <span className="maze-rank-list__name">{r.nickname}</span>
              <span className="maze-rank-list__time">
                {state.rankedBy === 'progress' ? `${r.remaining}칸 남음` : formatElapsed(r.elapsedMs)}
              </span>
              <span className="maze-rank-list__points">+{r.points}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="subtitle">기록이 없습니다.</p>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="operator-topbar__actions operator-topbar__actions--split">
        <button className="button button--ghost" disabled={busy} onClick={() => run(reset)}>
          한 판 더
        </button>
        <button className="button button--danger" disabled={busy} onClick={() => run(end)}>
          게임 종료
        </button>
      </div>
    </div>
  );
}
