import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import ChairsCircle from './ChairsCircle.jsx';
import * as audio from '../../lib/chairsAudio.js';
import { springPop, springSettle } from '../../lib/motionPresets.js';

/**
 * 대형화면 — 닉네임이 원을 돌고, 호루라기가 울리면 의자가 차오른다.
 * 소리는 여기서만 낸다 (참여자 폰마다 나면 시차로 어긋나 들린다).
 */
export default function ChairsScreenView({ state, serverTime }) {
  const [soundOn, setSoundOn] = useState(false);
  const lastStatusRef = useRef(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (state.status !== 'grabbing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.status]);

  // 상태가 바뀌는 순간에 맞춰 소리를 낸다
  useEffect(() => {
    const prev = lastStatusRef.current;
    lastStatusRef.current = state.status;
    if (!soundOn || prev === state.status) return;

    if (state.status === 'spinning') audio.startMusic();
    else if (state.status === 'grabbing') audio.whistle();
    else if (state.status === 'result' || state.status === 'ended') audio.endChime();
    else audio.stopMusic();
  }, [state.status, soundOn]);

  useEffect(() => () => audio.stopMusic(), []);

  const enableSound = async () => {
    const ok = await audio.unlock();
    setSoundOn(ok);
    if (ok && state.status === 'spinning') audio.startMusic();
  };

  const msLeft = state.grabEndsAt ? Math.max(0, state.grabEndsAt - serverTime()) : 0;

  if (state.status === 'ended') {
    return (
      <div className="screen__center">
        <p className="screen__eyebrow">의자 빨리 뺏기 — 종료</p>
        <motion.p
          className="chairs-screen__winner"
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

  return (
    <div className="screen__center chairs-screen">
      <div className="chairs-screen__head">
        <p className="screen__eyebrow">
          의자 빨리 뺏기 — {state.round}라운드 · 의자 {state.chairCount}개 · {state.players.length}명
        </p>
        {!soundOn && (
          <button className="button button--ghost chairs-screen__sound" onClick={enableSound}>
            🔊 소리 켜기
          </button>
        )}
      </div>

      <ChairsCircle state={state} serverTime={serverTime} />

      <AnimatePresence mode="wait">
        {state.status === 'spinning' && (
          <motion.p key="spin" className="screen__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            🎵 음악이 멈추면 의자를 잡으세요
          </motion.p>
        )}
        {state.status === 'grabbing' && (
          <motion.p
            key="grab"
            className="chairs-screen__whistle"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springPop}
          >
            앉으세요! {(msLeft / 1000).toFixed(1)}
          </motion.p>
        )}
        {state.status === 'result' && (
          <motion.div
            key="result"
            className="chairs-screen__result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springSettle}
          >
            {state.result?.outcome === 'wipeout' ? (
              <p className="screen__eyebrow">아무도 안 앉았어요 — 다시 합니다</p>
            ) : (
              <>
                <p className="chairs-screen__out">
                  탈락: {state.result?.eliminated?.map((e) => e.nickname).join(', ') || '없음'}
                </p>
                <p className="screen__hint">
                  생존 {state.result?.survivors?.length ?? 0}명
                </p>
              </>
            )}
          </motion.div>
        )}
        {state.status === 'idle' && state.round > 0 && (
          <motion.p key="idle" className="screen__hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            다음 라운드를 기다리는 중…
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
