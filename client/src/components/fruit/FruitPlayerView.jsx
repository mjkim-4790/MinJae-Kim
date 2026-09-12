import { motion } from 'motion/react';

import { springPop, springTap } from '../../lib/motionPresets.js';

/**
 * 참가자 폰 화면.
 *
 * 이 게임은 아이패드 앞에서 몸으로 하는 거라 폰이 할 일이 없다. 대신 누구 차례인지와
 * 방금 나온 점수를 보여준다 — 기다리는 사람도 같이 보고 있어야 재밌다.
 */
export default function FruitPlayerView({ game, participantId }) {
  const { state, dismissed, dismiss } = game;
  const mine = state.currentId != null && state.currentId === participantId;

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    if (dismissed) return null;
    const myRank = state.ranking?.findIndex((r) => r.participantId === participantId) ?? -1;
    const mineRow = myRank >= 0 ? state.ranking[myRank] : null;
    return (
      <section className="panel stack">
        <h2 className="panel__title">리듬 과일 자르기 — 종료</h2>
        {mineRow ? (
          <p className="rps-spectator">{myRank + 1}등 · {mineRow.points}점</p>
        ) : (
          <p className="rps-spectator">{state.doneCount}명이 도전했어요</p>
        )}
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  if (state.status === 'result' && state.lastResult) {
    const r = state.lastResult;
    return (
      <section className="panel stack">
        <h2 className="panel__title">리듬 과일 자르기</h2>
        <motion.p
          className={`chairs-verdict ${r.participantId === participantId ? 'chairs-verdict--safe' : ''}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {r.nickname} — {r.score}점
        </motion.p>
        <p className="subtitle">{r.sliced}/{r.total}개 · 최고 {r.maxCombo}콤보</p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2 className="panel__title">리듬 과일 자르기</h2>
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
          {state.status === 'playing' && state.currentNickname
            ? `${state.currentNickname} 님이 하는 중이에요`
            : state.currentNickname
              ? `${state.currentNickname} 님 차례예요`
              : '다음 사람을 기다리는 중…'}
        </p>
      )}
      {state.songName && <p className="subtitle">🎵 {state.songName}</p>}
    </section>
  );
}
