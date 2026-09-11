import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import PoseStage from './PoseStage.jsx';
import CameraStage from '../camera/CameraStage.jsx';
import { usePoseLandmarker } from '../../hooks/usePoseLandmarker.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { SEND_MS, anglesFrom, fullBodyVisible, pointsFromLandmarks } from '../../lib/silhouette.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

/** 아이패드 화면 — 따라 할 모양과 내 뼈대를 겹쳐 보여준다. */
export default function SilhouetteScreenView({ state, sendAngles }) {
  const active = state.status !== 'idle';
  const landmarker = usePoseLandmarker(active);
  useWakeLock(active);

  const pointsRef = useRef(null);
  const lastSentRef = useRef(0);
  const [camOn, setCamOn] = useState(false);
  const [inFrame, setInFrame] = useState(true);
  const [, tick] = useState(0);

  const posing = state.phase === 'posing';
  const walling = state.phase === 'wall';
  const wallMode = state.mode === 'wall';

  // 벽이 언제 출발해서 언제 닿는지 — 화면은 이 두 시각만으로 벽을 그린다
  const wallStartRef = useRef(null);
  useEffect(() => {
    wallStartRef.current = walling ? Date.now() : null;
  }, [walling, state.wallIndex]);

  // 남은 시간·게이지를 위해 진행 중에는 자주 다시 그린다 (벽 사이 간격 포함)
  useEffect(() => {
    if (state.status !== 'playing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  const onFrame = useCallback(
    (video, ts) => {
      const lm = landmarker.detect(video, ts);
      const pts = pointsFromLandmarks(lm);
      pointsRef.current = pts;

      const ok = fullBodyVisible(pts);
      setInFrame((prev) => (prev === ok ? prev : ok));

      if ((!posing && !walling) || !ok) return;
      // 각도만 보낸다. 관절 위치조차 서버로 넘기지 않는다.
      if (ts - lastSentRef.current < SEND_MS) return;
      lastSentRef.current = ts;
      const angles = anglesFrom(pts);
      if (angles) sendAngles(angles);
    },
    [landmarker, posing, walling, sendAngles],
  );

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">실루엣 통과 — 종료</p>
        <motion.p className="mg-screen__winner" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springPop}>
          🏆 {state.ranking?.[0]?.nickname ?? '없음'}
        </motion.p>
        <p className="screen__hint">{state.playedCount}명이 도전했습니다</p>
        {state.ranking?.length > 1 && (
          <p className="screen__hint">
            {state.ranking.slice(0, 5).map((r) => `${r.nickname} ${r.points}점`).join(' · ')}
          </p>
        )}
      </div>
    );
  }

  const msLeft = state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - Date.now()) : 0;
  const pct = Math.round((state.live?.match ?? 0) * 100);
  const need = Math.round((state.threshold ?? 0.78) * 100);
  const result = state.lastResult;

  return (
    <div className="screen__center sil-screen">
      <p className="screen__eyebrow">
        실루엣 통과
        {state.currentNickname ? ` — ${state.currentNickname} 차례` : ''}
        {state.pose && posing ? ` · ${state.pose.name}` : ''}
      </p>

      <CameraStage
        active={active}
        facingMode="user"
        hideVideo
        onFrame={onFrame}
        onActive={() => setCamOn(true)}
        permissionTitle="아이패드 카메라를 켜주세요"
        permissionBody="몸의 관절 각도만 읽습니다. 영상은 화면에 뜨지도, 저장되지도, 어디로 전송되지도 않습니다."
      />

      {camOn && (
        <>
          <div className="sil-screen__row">
            <PoseStage
              pose={state.pose}
              pointsRef={pointsRef}
              holding={state.live?.holding}
              wall={
                walling && state.phaseEndsAt
                  ? { startedAt: wallStartRef.current ?? Date.now(), hitsAt: state.phaseEndsAt }
                  : null
              }
            />

            <div className="sil-screen__side">
              <AnimatePresence mode="wait">
                {state.status === 'ready' && (
                  <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="sil-screen__big">
                      {state.currentNickname ? `${state.currentNickname} 나오세요!` : '다음 사람을 기다리는 중'}
                    </p>
                    <p className="screen__hint">
                      {landmarker.loading ? '자세 인식을 준비하는 중…' : landmarker.error ?? '전신이 보이게 뒤로 물러나 주세요'}
                    </p>
                  </motion.div>
                )}

                {state.phase === 'ready' && (
                  <motion.div key="count" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={springPop}>
                    <p className="sil-screen__count">{Math.max(1, Math.ceil(msLeft / 1000))}</p>
                    <p className="screen__hint">
                      {wallMode ? '벽이 다가옵니다 — 40초 동안 최대한 많이!' : '이 모양을 따라 하세요'}
                    </p>
                    {state.pose?.hint && <p className="sil-screen__hint">{state.pose.hint}</p>}
                  </motion.div>
                )}

                {walling && (
                  <motion.div key={`wall-${state.wallIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="sil-screen__hint">{state.pose?.hint}</p>
                    <p className={`sil-screen__match${state.live?.holding ? ' sil-screen__match--hit' : ''}`}>
                      {pct}%
                    </p>
                    <div className="sil-gauge">
                      <div className="sil-gauge__need" style={{ left: `${need}%` }} />
                      <div
                        className={`sil-gauge__fill${state.live?.holding ? ' sil-gauge__fill--hit' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* 마지막 1초에 들어오면 알려준다 — 여기서 잡힌 최고점으로 판정한다 */}
                    <p className={`sil-wall__now${state.live?.inWindow ? ' sil-wall__now--on' : ''}`}>
                      {state.live?.inWindow ? '지금!' : `벽이 온다 — ${(msLeft / 1000).toFixed(1)}초`}
                    </p>
                    <p className="screen__hint">
                      {state.passCount}장 통과 · 남은 시간 {Math.max(0, Math.ceil(((state.sessionEndsAt ?? 0) - Date.now()) / 1000))}초
                    </p>
                  </motion.div>
                )}

                {/* 벽과 벽 사이 — 방금 결과를 잠깐 보여준다.
                    status 까지 봐야 한다: 세션이 끝나도 lastWall 은 남아 있어서,
                    이 조건만으로는 최종 결과 화면과 겹쳐 떴다. */}
                {wallMode && state.status === 'playing' && !walling && state.phase === null && state.lastWall && (
                  <motion.div key={`gap-${state.lastWall.index}`} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springPop}>
                    <p className={`sil-screen__verdict ${state.lastWall.passed ? 'sil-screen__verdict--ok' : 'sil-screen__verdict--no'}`}>
                      {state.lastWall.passed ? '통과!' : '쿵!'}
                    </p>
                    <p className="screen__hint">
                      {state.lastWall.passed
                        ? `${state.passCount}장째`
                        : '같은 모양으로 한 번 더'}
                      {' · '}{state.lastWall.match}%
                    </p>
                  </motion.div>
                )}

                {posing && (
                  <motion.div key="posing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="sil-screen__hint">{state.pose?.hint}</p>
                    <p className={`sil-screen__match${state.live?.holding ? ' sil-screen__match--hit' : ''}`}>
                      {pct}%
                    </p>
                    <p className="screen__hint">{need}% 넘게 잠깐 유지</p>
                    <div className="sil-gauge">
                      <div className="sil-gauge__need" style={{ left: `${need}%` }} />
                      <div
                        className={`sil-gauge__fill${state.live?.holding ? ' sil-gauge__fill--hit' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="sil-screen__time">{(msLeft / 1000).toFixed(1)}초</p>
                  </motion.div>
                )}

                {state.status === 'result' && result && (
                  <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springSettle}>
                    <p className={`sil-screen__verdict ${result.passed ? 'sil-screen__verdict--ok' : 'sil-screen__verdict--no'}`}>
                      {result.mode === 'wall'
                        ? `${result.passCount}장!`
                        : result.passed ? '통과!' : '아쉬워요'}
                    </p>
                    <p className="sil-screen__big">{result.nickname}</p>
                    <p className="screen__hint">
                      {result.mode === 'wall'
                        ? `벽 ${result.passCount}/${result.attemptCount}장 통과`
                        : `${result.poseName} · 최고 ${result.match}%`}
                    </p>
                    {result.points > 0 && <p className="sil-screen__points">+{result.points}점</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 전신이 안 잡히면 각도를 못 재므로 먼저 알려준다 */}
          {!inFrame && (state.phase === 'ready' || posing || walling) && (
            <p className="sil-screen__warn">전신이 보이게 뒤로 물러나 주세요</p>
          )}
        </>
      )}
    </div>
  );
}
