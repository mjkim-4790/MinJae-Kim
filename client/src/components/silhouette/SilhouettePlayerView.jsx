import { motion } from 'motion/react';

import { springPop, springTap } from '../../lib/motionPresets.js';

/**
 * 참가자 폰 화면. 조작은 없고 호출만 알려준다 —
 * 줄이 길면 진행자가 이름을 불러도 뒤에서는 안 들린다 (후출 가위바위보와 같은 이유).
 */
export default function SilhouettePlayerView({ game, participantId }) {
  const { state, dismissed, dismiss } = game;
  if (state.status === 'idle') return null;

  const mine = state.currentId != null && state.currentId === participantId;
  const done = (state.doneIds ?? []).includes(participantId);

  if (state.status === 'ended') {
    if (dismissed) return null;
    const me = state.ranking?.find((r) => r.participantId === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">실루엣 통과 — 종료</h2>
        <p className="rps-spectator">{me ? `내 점수 ${me.points}점` : '이번엔 차례가 오지 않았어요'}</p>
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  if (state.status === 'result' && state.lastResult?.participantId === participantId) {
    const r = state.lastResult;
    return (
      <section className="panel stack">
        <h2 className="panel__title">실루엣 통과</h2>
        <motion.p
          className={`chairs-verdict ${r.passed ? 'chairs-verdict--safe' : 'chairs-verdict--out'}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {r.passed ? `통과! ${r.poseName} · +${r.points}점` : `아쉬워요 · 최고 ${r.match}%`}
        </motion.p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2 className="panel__title">실루엣 통과</h2>
      {mine ? (
        <motion.p
          className="chairs-verdict chairs-verdict--safe"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          내 차례예요! 아이패드 앞으로 나와 전신이 보이게 서세요
        </motion.p>
      ) : (
        <p className="rps-spectator">
          {state.currentNickname
            ? `${state.currentNickname} 님이 하는 중이에요`
            : done
              ? '내 차례는 끝났어요. 구경하세요!'
              : '차례를 기다리는 중…'}
        </p>
      )}
    </section>
  );
}
