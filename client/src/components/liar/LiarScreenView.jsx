import { AnimatePresence, motion } from 'motion/react';

import { springPop } from '../../lib/motionPresets.js';

const screenPop = { type: 'spring', bounce: 0.4, duration: 0.5 };

function nicknameOf(participantsById, id) {
  return participantsById.get(id)?.nickname ?? `#${id}`;
}

/** 대형 스크린의 라이어 게임 연출. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function LiarScreenView({ state, participants = [] }) {
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  if (state.status === 'idle') return null;

  return (
    <AnimatePresence mode="wait">
      {(state.status === 'result' || state.status === 'ended') && state.result && (
        <motion.div
          key="result"
          className="screen__center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={screenPop}
        >
          <p className="screen__eyebrow">결과 공개</p>
          <p className="screen__liar-emoji">{state.result.winner === 'liar' ? '🎭' : '🕵️'}</p>
          <p className="screen__code" style={{ fontSize: 'clamp(40px,7vw,96px)' }}>
            {state.result.winner === 'liar' ? '라이어 승' : '시민 승'}
          </p>
          <p className="screen__liar-list">
            실제 라이어: {state.result.liar?.nickname} · 시민 단어 "{state.result.citizenWord}" · 라이어
            단어 "{state.result.liarWord}"
          </p>
        </motion.div>
      )}

      {state.status === 'voting' && (
        <motion.div
          key="voting"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">{state.category?.name} · 지목 투표 중</p>
          <p className="screen__liar-emoji">🗳️</p>
          <p className="screen__liar-list">
            지목 완료 {state.votedParticipantIds.length}/{state.activeParticipantIds.length}
          </p>
        </motion.div>
      )}

      {state.status === 'describing' && (
        <motion.div
          key="describing"
          className="screen__center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={springPop}
        >
          <p className="screen__eyebrow">{state.category?.name} · 설명 중</p>
          <p className="screen__code" style={{ fontSize: 'clamp(32px,6vw,80px)' }}>
            {nicknameOf(participantsById, state.currentTurnParticipantId)}
          </p>
          <p className="screen__liar-list">
            발언 순서: {state.turnOrder.map((id) => nicknameOf(participantsById, id)).join(' → ')}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
