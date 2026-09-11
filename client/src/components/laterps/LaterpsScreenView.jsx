import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import HandStage from './HandStage.jsx';
import CameraStage from '../camera/CameraStage.jsx';
import { useGestureRecognizer } from '../../hooks/useGestureRecognizer.js';
import { useWakeLock } from '../../hooks/useWakeLock.js';
import { HAND_EMOJI, HAND_NAME, feedGesture } from '../../lib/laterps.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

/**
 * 아이패드 화면 — 이 게임의 무대 전체.
 *
 * 줄 선 사람들이 다 같이 보는 화면이라 카메라 영상은 띄우지 않는다 (HandStage 주석 참고).
 * 캐릭터가 손을 내고 → 잠깐 뜸을 들이고 → 지시가 뜬다. 그 뜸이 이 놀이의 함정이라
 * 지시는 서버가 정한 시각에만 내려온다 (미리 받아두고 숨기지 않는다).
 */
export default function LaterpsScreenView({ state, sendGesture }) {
  const active = state.status !== 'idle';
  const turn = state.turn;
  const phase = turn?.phase ?? null;

  const recognizer = useGestureRecognizer(active);
  useWakeLock(active);

  const landmarksRef = useRef(null);
  const storeRef = useRef({ hand: null, count: 0 });
  const sentRef = useRef(false);
  const [seen, setSeen] = useState(null); // 마지막으로 확정된 손 (연출용)
  const [camOn, setCamOn] = useState(false);
  const [, tick] = useState(0);

  // 남은 시간 막대를 위해 자주 다시 그린다
  useEffect(() => {
    if (phase !== 'answer' && phase !== 'ready') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [phase]);

  // 새 비트가 열리면 '이미 보냈음'을 푼다
  useEffect(() => {
    sentRef.current = false;
    storeRef.current = { hand: null, count: 0 };
    if (phase === 'reveal') setSeen(null);
  }, [phase, turn?.index]);

  const onFrame = useCallback(
    (video, ts) => {
      const res = recognizer.recognize(video, ts);
      if (!res) return;
      landmarksRef.current = res.landmarks;

      // 지시가 뜨기 전에는 읽기만 하고 보내지 않는다 (서버도 거절한다)
      if (phase !== 'answer' || sentRef.current) return;

      const settled = feedGesture(storeRef.current, res.gesture, res.score);
      if (!settled) return;
      sentRef.current = true;
      setSeen(settled);
      sendGesture(settled);
    },
    [recognizer, phase, sendGesture],
  );

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">후출 가위바위보 — 종료</p>
        <motion.p
          className="mg-screen__winner"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
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

  const msLeft = turn?.phaseEndsAt ? Math.max(0, turn.phaseEndsAt - Date.now()) : 0;
  const result = state.lastResult;

  return (
    <div className="screen__center lr-screen">
      <p className="screen__eyebrow">
        후출 가위바위보
        {state.currentNickname ? ` — ${state.currentNickname} 차례` : ''}
      </p>

      {/* 카메라는 돌리되 화면에는 안 띄운다 — 줄 선 사람들이 다 같이 보는 화면이라
          얼굴이 걸리는 그림을 만들지 않는다. 인식된 손 뼈대만 아래에 보여준다. */}
      <CameraStage
        active={active}
        facingMode="user"
        hideVideo
        onFrame={onFrame}
        onActive={() => setCamOn(true)}
        permissionTitle="아이패드 카메라를 켜주세요"
        permissionBody="손 모양만 읽습니다. 영상은 화면에 뜨지도, 저장되지도, 어디로 전송되지도 않습니다."
      />

      {/* 카메라가 켜지기 전에는 게임 내용을 띄우지 않는다 — 어차피 진행할 수 없고,
          안내와 게임 화면이 같이 떠 있으면 무엇을 해야 하는지 흐려진다. */}
      <AnimatePresence mode="wait">
        {!camOn && null}
        {/* 대기 */}
        {camOn && state.status === 'ready' && (
          <motion.div key="wait" className="lr-screen__center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="lr-screen__big">
              {state.currentNickname ? `${state.currentNickname} 나오세요!` : '다음 사람을 기다리는 중'}
            </p>
            <p className="screen__hint">
              {recognizer.loading
                ? '손 인식을 준비하는 중…'
                : recognizer.error
                  ? recognizer.error
                  : '화면 앞에 서서 한 손을 들어주세요'}
            </p>
          </motion.div>
        )}

        {/* 준비 카운트다운 */}
        {camOn && phase === 'ready' && (
          <motion.div key="count" className="lr-screen__center" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={springPop}>
            <p className="lr-screen__count">{Math.max(1, Math.ceil(msLeft / 1000))}</p>
            <p className="screen__hint">손을 들고 준비하세요</p>
          </motion.div>
        )}

        {/* 캐릭터가 손을 냈다 — 아직 지시는 없다 */}
        {camOn && phase === 'reveal' && (
          <motion.div key={`rev-${turn.index}`} className="lr-screen__center" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={springPop}>
            <p className="lr-screen__hand">{HAND_EMOJI[turn.hand]}</p>
            <p className="lr-screen__wait">…</p>
          </motion.div>
        )}

        {/* 지시 */}
        {camOn && phase === 'answer' && (
          <motion.div key={`ans-${turn.index}`} className="lr-screen__center" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={springPop}>
            <p className="lr-screen__hand">{HAND_EMOJI[turn.hand]}</p>
            <p className={`lr-screen__order lr-screen__order--${turn.instruction}`}>
              {turn.instruction === 'win' ? '이겨!' : '져!'}
            </p>
            <div className="lr-screen__bar">
              <div
                className="lr-screen__bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, (msLeft / 2600) * 100))}%` }}
              />
            </div>
            {seen && <p className="screen__hint">{HAND_EMOJI[seen]} {HAND_NAME[seen]}</p>}
          </motion.div>
        )}

        {/* 결과 */}
        {camOn && state.status === 'result' && result && (
          <motion.div key="result" className="lr-screen__center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springSettle}>
            <p className="lr-screen__big">{result.nickname}</p>
            <ul className="lr-beats">
              {result.beats.map((b, i) => (
                <li key={i} className={`lr-beat${b.correct ? ' lr-beat--ok' : ''}`}>
                  <span className="lr-beat__hand">{HAND_EMOJI[b.hand]}</span>
                  <span className="lr-beat__order">{b.instruction === 'win' ? '이겨' : '져'}</span>
                  <span className="lr-beat__arrow">→</span>
                  <span className="lr-beat__answer">
                    {b.answered ? HAND_EMOJI[b.answered] : '⏱'}
                  </span>
                  <span className="lr-beat__mark">{b.correct ? '⭕' : '❌'}</span>
                </li>
              ))}
            </ul>
            <p className="lr-screen__points">+{result.points}점</p>
          </motion.div>
        )}
      </AnimatePresence>

      {camOn && (
      <HandStage
        landmarksRef={landmarksRef}
        hint={recognizer.ready ? null : recognizer.loading ? '손 인식 준비 중…' : recognizer.error}
      />
      )}
    </div>
  );
}
