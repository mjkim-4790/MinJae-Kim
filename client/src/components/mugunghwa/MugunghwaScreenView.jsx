import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import MugunghwaTrack from './MugunghwaTrack.jsx';
import { speakChant, stopChant } from '../../lib/mugunghwa.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

/**
 * 대형화면 — 영희가 등을 돌렸다 돌아보고, 사람들이 다가온다.
 *
 * 구호는 여기서만 읽는다. 참여자 폰마다 읽으면 기기별 시차로 여러 번 겹쳐 들린다.
 * 브라우저 음성 합성이라 한국어 목소리가 없는 PC 도 있는데, 그때는 자막으로 대신한다.
 */
export default function MugunghwaScreenView({ state, serverTime, livePositions }) {
  const [soundOn, setSoundOn] = useState(false);
  const lastGreenRef = useRef(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (state.status !== 'sprinting') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  // 등을 돌리는 순간(초록불)에 구호를 읽는다
  useEffect(() => {
    const prev = lastGreenRef.current;
    lastGreenRef.current = state.green;
    if (!soundOn) return;
    if (state.status !== 'approaching') {
      stopChant();
      return;
    }
    if (prev === state.green) return;
    if (state.green) speakChant();
    else stopChant();
  }, [state.green, state.status, soundOn]);

  useEffect(() => () => stopChant(), []);

  const enableSound = () => {
    // 첫 발화는 클릭 안에서 해야 브라우저가 막지 않는다
    speakChant();
    stopChant();
    setSoundOn(true);
  };

  const msLeft = state.sprintEndsAt ? Math.max(0, state.sprintEndsAt - serverTime()) : 0;
  const alive = (state.runners ?? []).filter((r) => !r.caught).length;

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">무궁화꽃이 피었습니다 — 종료</p>
        <motion.p
          className="mg-screen__winner"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          🏆 {state.result?.survivors?.map((s) => s.nickname).join(', ') || '없음'}
        </motion.p>
        <p className="screen__hint">{state.round}라운드 끝에 남은 최후의 1인</p>
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">무궁화꽃이 피었습니다 — 곧 시작합니다</p>
        <p className="mg-screen__big">📱</p>
        <p className="screen__hint">폰에서 “움직임 감지 허용하기”를 눌러주세요</p>
        {!soundOn && (
          <button className="button button--ghost" onClick={enableSound}>
            🔊 소리 켜기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="screen__center mg-screen">
      <div className="mg-screen__head">
        <p className="screen__eyebrow">
          무궁화꽃이 피었습니다 — {state.round}라운드 · 남은 사람 {alive}명
          {state.doll ? ` · 영희 ${state.doll.nickname}` : ' · 영희 진행자'}
        </p>
        {!soundOn && (
          <button className="button button--ghost mg-screen__sound" onClick={enableSound}>
            🔊 소리 켜기
          </button>
        )}
      </div>

      <MugunghwaTrack state={state} positions={livePositions} />

      <AnimatePresence mode="wait">
        {state.status === 'approaching' && (
          <motion.p
            key={state.green ? 'green' : 'red'}
            className={`mg-screen__chant ${state.green ? 'mg-screen__chant--green' : 'mg-screen__chant--red'}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            {state.green ? '무궁화 꽃이 피었습니다…' : '돌아봤다! 움직이면 아웃'}
          </motion.p>
        )}
        {state.status === 'sprinting' && (
          <motion.p
            key="sprint"
            className="mg-screen__chant mg-screen__chant--sprint"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springPop}
          >
            {state.toucher?.nickname ?? '누군가'}가 영희를 터치! 도망쳐 — {(msLeft / 1000).toFixed(1)}
          </motion.p>
        )}
        {state.status === 'result' && (
          <motion.div
            key="result"
            className="mg-screen__result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSettle}
          >
            {state.result?.outcome === 'wipeout' ? (
              <p className="screen__eyebrow">아무도 못 돌아왔어요 — 다시 합니다</p>
            ) : (
              <>
                <p className="mg-screen__out">
                  탈락: {state.result?.eliminated?.map((e) => e.nickname).join(', ') || '없음'}
                </p>
                <p className="screen__hint">
                  생존 {state.result?.survivors?.length ?? 0}명
                  {state.result?.toucher ? ` · 영희를 터치한 사람: ${state.result.toucher.nickname}` : ''}
                </p>
              </>
            )}
          </motion.div>
        )}
        {state.status === 'idle' && state.round > 0 && (
          <motion.p key="idle" className="screen__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            다음 라운드를 기다리는 중…
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
