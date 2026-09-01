import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import MazeRaceBoard from './MazeRaceBoard.jsx';
import { SPOTLIGHT_COUNT, runnerColor } from '../../lib/maze.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

const WARN_MS = 5000;

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(2)}초`;
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** 대형스크린 — 진행 중에는 남은 시간과 완주 인원, 결과 공개 후에는 전체 기록. */
export default function MazeScreenView({ state, serverTime, livePositions }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (state.status !== 'countdown' && state.status !== 'racing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  const msLeft = state.endsAt ? Math.max(0, state.endsAt - serverTime()) : 0;
  const countdownLeft = state.startsAt ? Math.max(0, state.startsAt - serverTime()) : 0;
  const entrants = state.activeParticipantIds.length;

  if (state.status === 'countdown') {
    const n = Math.max(1, Math.ceil(countdownLeft / 1000));
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">미로 찾기 — 곧 출발합니다</p>
        <motion.p
          key={n}
          className="maze-screen__countdown"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {n}
        </motion.p>
        <p className="screen__hint">
          {state.control === 'tilt' ? '폰을 눕혀 들고 기울일 준비!' : '방향 버튼을 누를 준비!'}
        </p>
      </div>
    );
  }

  if (state.status === 'racing') {
    const warn = msLeft <= WARN_MS;
    const board = livePositions?.runners ?? [];
    const nameOf = new Map((state.runners ?? []).map((r) => [r.participantId, r]));

    return (
      <div className="screen__center maze-live">
        <div className="maze-live__head">
          <p className="screen__eyebrow">미로 찾기 — 진행 중</p>
          <motion.p
            key={warn ? Math.ceil(msLeft / 1000) : 'run'}
            className={`maze-live__timer${warn ? ' maze-live__timer--warn' : ''}`}
            initial={warn ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={springPop}
          >
            {warn ? Math.ceil(msLeft / 1000) : `${Math.ceil(msLeft / 1000)}초`}
          </motion.p>
        </div>

        <div className="maze-live__body">
          <MazeRaceBoard maze={state.maze} runners={state.runners} positions={livePositions} />

          <ol className="maze-live__rank">
            {board.slice(0, SPOTLIGHT_COUNT).map((r, i) => {
              const info = nameOf.get(r.participantId);
              return (
                <li key={r.participantId} className="maze-live__row">
                  <span className="maze-live__pos">{i + 1}</span>
                  <span
                    className="maze-live__chip"
                    style={{ background: runnerColor(info?.colorIndex ?? 0) }}
                  />
                  <span className="maze-live__name">{info?.nickname ?? '…'}</span>
                  <span className="maze-live__gap">
                    {r.finishedMs != null ? '도착' : `${r.remaining}칸`}
                  </span>
                </li>
              );
            })}
            {board.length === 0 && <li className="maze-live__waiting">출발 준비 중…</li>}
          </ol>
        </div>

        <p className="screen__hint">
          완주 {state.finishedParticipantIds.length} / {entrants}명
          {board.length > SPOTLIGHT_COUNT && ` · 나머지 ${board.length - SPOTLIGHT_COUNT}명은 흐리게 표시`}
        </p>
      </div>
    );
  }

  if (state.status === 'finished') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">미로 찾기 — 경기 종료</p>
        <p className="maze-screen__timer">{state.finishedParticipantIds.length}명 완주</p>
        <p className="screen__hint">진행자가 결과를 공개하면 기록이 나옵니다</p>
      </div>
    );
  }

  // result / ended — 참가자 전체 기록
  const ranking = state.ranking ?? [];
  return (
    <div className="screen__center">
      <p className="screen__eyebrow">
        미로 찾기 — 기록{state.status === 'ended' ? ' · 종료' : ''}
      </p>

      <AnimatePresence>
        {ranking.length === 0 ? (
          <motion.p className="screen__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springSettle}>
            완주한 사람이 없습니다
          </motion.p>
        ) : (
          <motion.ol className="maze-screen__board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springSettle}>
            {ranking.map((r, i) => (
              <motion.li
                key={r.participantId}
                className={`maze-screen__row${r.rank <= 3 ? ' maze-screen__row--top' : ''}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springPop, delay: Math.min(i * 0.06, 0.6) }}
              >
                <span className="maze-screen__rank">{MEDAL[r.rank] ?? r.rank}</span>
                <span className="maze-screen__name">{r.nickname}</span>
                <span className="maze-screen__time">{formatElapsed(r.elapsedMs)}</span>
                <span className="maze-screen__points">+{r.points}</span>
              </motion.li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>

      <p className="screen__hint">
        완주 {ranking.length} / 참가 {entrants}명
      </p>
    </div>
  );
}
