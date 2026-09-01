import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import MazeBoard from './MazeBoard.jsx';
import { useTilt } from '../../hooks/useTilt.js';
import { runnerColor } from '../../lib/maze.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

const WARN_MS = 5000; // 남은 시간이 이보다 적으면 큰 숫자로 센다

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(2)}초`;
}

/** 화면 방향 버튼 — 누르고 있는 동안 그 방향으로 가속한다. */
function PadButton({ dir, axisRef, label, symbol }) {
  const apply = (on) => {
    const a = axisRef.current;
    if (dir === 'up') a.ay = on ? -1 : 0;
    if (dir === 'down') a.ay = on ? 1 : 0;
    if (dir === 'left') a.ax = on ? -1 : 0;
    if (dir === 'right') a.ax = on ? 1 : 0;
  };
  return (
    <button
      type="button"
      className={`maze-pad__btn maze-pad__btn--${dir}`}
      aria-label={label}
      // 입력을 먼저 반영하고, 포인터 캡처는 실패해도 무시한다.
      // (캡처를 먼저 부르면 그게 예외를 던졌을 때 버튼이 통째로 먹통이 된다)
      onPointerDown={(e) => {
        e.preventDefault();
        apply(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 캡처는 손가락이 버튼 밖으로 나가도 계속 눌린 것으로 쳐주는 편의 기능일 뿐이다
        }
      }}
      onPointerUp={() => apply(false)}
      onPointerCancel={() => apply(false)}
      onPointerLeave={() => apply(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {symbol}
    </button>
  );
}

export default function MazePlayerView({ game, participantId }) {
  const { state, myFinishMs, dismissed, serverTime, sendPosition, finish, dismiss } = game;
  const tilt = useTilt();
  const padRef = useRef({ ax: 0, ay: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const [resets, setResets] = useState(0);

  const inRace = state.activeParticipantIds.includes(participantId);
  const racing = state.status === 'racing';
  const usingTilt = state.control === 'tilt';
  const hardMode = state.difficulty === 'hard';

  // 카운트다운·남은시간 표시를 위해 경기 중에만 짧은 주기로 다시 그린다
  useEffect(() => {
    if (state.status !== 'countdown' && state.status !== 'racing') return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.status]);

  // 새 경기가 시작되면 버튼 입력을 초기화한다 (누른 채로 판이 바뀐 경우 대비)
  const { calibrate } = tilt;
  useEffect(() => {
    if (state.status === 'countdown') {
      padRef.current = { ax: 0, ay: 0 };
      setResets(0);
      calibrate();
    }
  }, [state.status, calibrate]);

  const handleWallReset = useCallback(() => setResets((n) => n + 1), []);

  const handleGoal = useCallback(async () => {
    setFinishing(true);
    await finish();
    setFinishing(false);
  }, [finish]);

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    const mine = state.ranking?.find((r) => r.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">미로 찾기 — 종료</h2>
        {mine ? (
          <motion.p className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
            {mine.rank}등 ·{' '}
            {state.rankedBy === 'progress' ? `${mine.remaining}칸 남음` : formatElapsed(mine.elapsedMs)} · +
            {mine.points}점
          </motion.p>
        ) : (
          <p className="rps-spectator">이번 판은 완주하지 못했어요.</p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // 결과 공개 — 내 등수와 기록
  if (state.status === 'result') {
    const mine = state.ranking?.find((r) => r.id === participantId);
    return (
      <section className="panel stack maze-stage">
        <h2 className="panel__title">미로 찾기 — 결과</h2>
        {mine ? (
          <motion.div className="maze-myresult" initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
            <p className="maze-myresult__rank">{mine.rank}등</p>
            <p className="maze-myresult__time">
              {state.rankedBy === 'progress'
                ? `도착까지 ${mine.remaining}칸 남음`
                : formatElapsed(mine.elapsedMs)}
            </p>
            <p className="maze-myresult__points">+{mine.points}점</p>
          </motion.div>
        ) : (
          <p className="rps-spectator">
            {inRace ? '시간 안에 도착하지 못했어요.' : '이번 판은 관전했어요.'}
          </p>
        )}
        <p className="subtitle">
          {state.rankedBy === 'progress'
            ? `완주자 없음 — 가장 멀리 간 순 (참가 ${state.activeParticipantIds.length}명)`
            : `완주 ${state.ranking?.length ?? 0}명 / 참가 ${state.activeParticipantIds.length}명`}
        </p>
      </section>
    );
  }

  if (!inRace) {
    return (
      <section className="panel stack maze-stage">
        <h2 className="panel__title">미로 찾기</h2>
        <p className="rps-spectator">이번 판은 관전 중입니다.</p>
      </section>
    );
  }

  // now 는 값 자체를 쓰기보다, 100ms 마다 다시 그리게 만드는 용도다.
  // 남은 시간은 서버 시계 기준으로 계산해야 모든 폰이 같은 숫자를 본다.
  void now;
  const msLeft = state.endsAt ? Math.max(0, state.endsAt - serverTime()) : 0;
  const countdownLeft = state.startsAt ? Math.max(0, state.startsAt - serverTime()) : 0;
  const done = myFinishMs != null;
  const myRunner = state.runners?.find((r) => r.participantId === participantId);
  const myColor = myRunner ? runnerColor(myRunner.colorIndex) : null;

  // 기울기 모드인데 아직 권한을 안 받았으면 먼저 받아야 한다 (iOS 필수)
  const needsTiltSetup = usingTilt && !tilt.granted;

  return (
    <section className="panel stack maze-stage">
      <h2 className="panel__title">미로 찾기</h2>

      {state.status === 'countdown' && (
        <motion.p
          key={Math.ceil(countdownLeft / 1000)}
          className="maze-countdown"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {Math.max(1, Math.ceil(countdownLeft / 1000))}
        </motion.p>
      )}

      {racing && !done && (
        <p className={`maze-timer${msLeft <= WARN_MS ? ' maze-timer--warn' : ''}`}>
          {msLeft <= WARN_MS ? Math.ceil(msLeft / 1000) : `${Math.ceil(msLeft / 1000)}초 남음`}
        </p>
      )}

      {done && (
        <motion.p className="typing-final-banner" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={springPop}>
          🎉 도착! {formatElapsed(myFinishMs)}
        </motion.p>
      )}
      {finishing && <p className="subtitle">기록 보내는 중…</p>}

      {needsTiltSetup ? (
        <div className="stack">
          <p className="subtitle">
            폰을 눕혀 들고 기울여서 공을 굴립니다. 먼저 기울기 사용을 허용해주세요.
          </p>
          <button className="button" onClick={tilt.request}>
            기울기 사용 허용하기
          </button>
          {tilt.error && <p className="error-text">{tilt.error}</p>}
          {!tilt.supported && (
            <p className="subtitle">
              진행자에게 <strong>버튼 조작</strong>으로 바꿔달라고 요청하세요.
            </p>
          )}
        </div>
      ) : (
        <>
          <MazeBoard
            maze={state.maze}
            running={racing && !done}
            axisRef={usingTilt ? tilt.axisRef : padRef}
            onGoal={handleGoal}
            onPosition={sendPosition}
            resetOnWall={hardMode}
            onWallReset={handleWallReset}
          />

          {hardMode && (
            <p className={`subtitle maze-hard${resets > 0 ? ' maze-hard--hit' : ''}`}>
              {resets === 0
                ? '벽에 닿으면 처음부터! 조심조심…'
                : `벽에 닿아 ${resets}번 처음으로 돌아갔어요`}
            </p>
          )}

          {myColor && (
            <p className="subtitle maze-mycolor">
              <span className="maze-mycolor__dot" style={{ background: myColor }} />
              대형화면에서 내 공은 이 색이에요
            </p>
          )}

          {usingTilt ? (
            <>
              <p className="subtitle">폰을 기울여 공을 도착까지 굴리세요.</p>
              <button className="button button--ghost" onClick={tilt.calibrate}>
                지금 자세를 수평으로 맞추기
              </button>
            </>
          ) : (
            <>
              <p className="subtitle">버튼을 누르고 있으면 그 방향으로 굴러갑니다.</p>
              <div className="maze-pad">
                <PadButton dir="up" axisRef={padRef} label="위로" symbol="▲" />
                <PadButton dir="left" axisRef={padRef} label="왼쪽으로" symbol="◀" />
                <PadButton dir="right" axisRef={padRef} label="오른쪽으로" symbol="▶" />
                <PadButton dir="down" axisRef={padRef} label="아래로" symbol="▼" />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
