import { motion } from 'motion/react';

import { springPop, springTap } from '../../lib/motionPresets.js';

/**
 * 참가자 폰 화면. 조작은 없고 호출과 결과만 알려준다 —
 * 이 코너는 아이패드 앞에 나가서 하는 것이라(운영 결정), 폰은 "내 차례"를
 * 놓치지 않게 하는 역할과 결과를 손에 남겨주는 역할만 한다.
 */
export default function PersonalColorPlayerView({ game, participantId }) {
  const { state, dismissed, dismiss } = game;
  if (state.status === 'idle') return null;

  const mine = state.currentId != null && state.currentId === participantId;
  const myResult = state.lastResult?.participantId === participantId ? state.lastResult : null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    return (
      <section className="panel stack">
        <h2 className="panel__title">퍼스널컬러 — 종료</h2>
        <p className="rps-spectator">{state.doneCount}명이 자기 색을 찾았어요</p>
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  if (myResult) {
    return (
      <section className="panel stack">
        <h2 className="panel__title">내 퍼스널컬러</h2>
        <motion.p
          className="chairs-verdict chairs-verdict--safe"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {myResult.typeName}
        </motion.p>
        <p className="subtitle">{myResult.desc}</p>
        {/* 어울리는 색을 폰에 남겨준다 — 쇼핑할 때 꺼내 볼 수 있게 */}
        <ul className="pc-palette">
          {myResult.palette.map((c) => (
            <li key={c} className="pc-palette__chip" style={{ background: c }} />
          ))}
        </ul>
        <p className="subtitle">피하면 좋은 색: {myResult.avoid}</p>
        <p className="subtitle">재미로 보는 결과예요 — 조명에 따라 달라질 수 있어요.</p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2 className="panel__title">퍼스널컬러 찾아보기</h2>
      {mine ? (
        <motion.p
          className="chairs-verdict chairs-verdict--safe"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          내 차례예요! 아이패드 앞으로 나오세요
        </motion.p>
      ) : (
        <p className="rps-spectator">
          {state.currentNickname
            ? `${state.currentNickname} 님이 하는 중이에요`
            : '차례를 기다리는 중…'}
        </p>
      )}
    </section>
  );
}
