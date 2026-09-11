import { motion } from 'motion/react';

import { HAND_EMOJI } from '../../lib/laterps.js';
import { springPop, springTap } from '../../lib/motionPresets.js';

/**
 * 참가자 폰 화면.
 *
 * 이 게임은 아이패드 앞에 나가서 하는 거라 폰으로 조작할 게 없다. 그래도 화면을
 * 비워두지 않는 이유는 **호출을 놓치지 않게** 하기 위해서다 — 줄이 길면 진행자가
 * 이름을 불러도 뒤에서는 안 들린다. 자기 차례가 되면 폰이 알려준다.
 */
export default function LaterpsPlayerView({ game, participantId }) {
  const { state, dismissed, dismiss } = game;
  if (state.status === 'idle') return null;

  const mine = state.currentId != null && state.currentId === participantId;
  const done = (state.doneIds ?? []).includes(participantId);

  if (state.status === 'ended') {
    if (dismissed) return null;
    const me = state.ranking?.find((r) => r.participantId === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">후출 가위바위보 — 종료</h2>
        <p className="rps-spectator">
          {me ? `내 점수 ${me.points}점` : '이번엔 차례가 오지 않았어요'}
        </p>
        <motion.button className="button" onClick={dismiss} whileTap={{ scale: 0.96 }} transition={springTap}>
          확인
        </motion.button>
      </section>
    );
  }

  // 방금 내 차례가 끝났다
  if (state.status === 'result' && state.lastResult?.participantId === participantId) {
    const r = state.lastResult;
    const hit = r.beats.filter((b) => b.correct).length;
    return (
      <section className="panel stack">
        <h2 className="panel__title">후출 가위바위보</h2>
        <motion.p
          className={`chairs-verdict ${hit > 0 ? 'chairs-verdict--safe' : 'chairs-verdict--out'}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springPop}
        >
          {hit}/{r.beats.length} 성공 · +{r.points}점
        </motion.p>
        <p className="subtitle">
          {r.beats.map((b, i) => (
            <span key={i}>
              {HAND_EMOJI[b.hand]} {b.instruction === 'win' ? '이겨' : '져'} →{' '}
              {b.answered ? HAND_EMOJI[b.answered] : '무응답'} {b.correct ? '⭕' : '❌'}
              {i < r.beats.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2 className="panel__title">후출 가위바위보</h2>
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
            : done
              ? '내 차례는 끝났어요. 구경하세요!'
              : '차례를 기다리는 중…'}
        </p>
      )}
    </section>
  );
}
