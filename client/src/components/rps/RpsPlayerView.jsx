import { AnimatePresence, motion } from 'motion/react';

import { ChoiceEmoji } from './ChoiceEmoji.jsx';
import { springPop, springTap } from '../../lib/motionPresets.js';
import { CHOICE_META, CHOICES } from '../../lib/rps.js';

// 하단 고정 선택 시트 전용 스프링 — Apple 이 "Drawer / sheet" 에 쓰는 값(damping 0.8,
// response 0.3)에 가깝게 맞춘 살짝의 바운스. 큰 리빌(springPop)보다는 차분하다.
const sheetSpring = { type: 'spring', bounce: 0.2, duration: 0.35 };

function branchMessage(outcome, won) {
  if (won) return outcome === 'ended' ? '목표 달성! 최종 생존했습니다 🎉' : '생존했습니다! 다음 라운드로';
  return outcome === 'ended' || outcome === 'overshoot'
    ? '탈락했습니다'
    : '탈락 — 패자부활전에서 다시 도전합니다';
}

function RoundResult({ state, participantId }) {
  const outcome = state.roundResult.branchOutcome;
  if (outcome === 'wipeout') {
    return (
      <div className="rps-spectator">전멸! 이 라운드는 무효 처리되어 같은 인원으로 다시 대결합니다.</div>
    );
  }

  const won = state.roundResult.winners.some((w) => w.id === participantId);
  const wasInRound = won || state.roundResult.nonWinners.some((w) => w.id === participantId);
  if (!wasInRound) return null;

  return (
    <div className={`rps-result-line ${won ? 'rps-result-line--win' : 'rps-result-line--lose'}`}>
      <span className="rps-inline">
        MC: <ChoiceEmoji choice={state.operatorChoice} size={22} />
      </span>
      {' · '}
      {branchMessage(outcome, won)}
    </div>
  );
}

// 화면 하단에 고정으로 올라오는 선택 시트. 내 차례일 때만 나타나고 고르면 바로 내려간다
// (§12 머티리얼 — 반투명 층이 콘텐츠 위로 떠 있는 느낌, §7 공간 일관성 — 아래에서 나와
// 아래로 사라지는 왕복 경로).
function ChoiceSheet({ open, onChoose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="rps-choice-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={sheetSpring}
        >
          <p className="rps-choice-sheet__hint">가위·바위·보 중 하나를 선택하세요</p>
          <div className="rps-choice-row rps-choice-row--sheet">
            {CHOICES.map((c) => (
              <motion.button
                key={c}
                className="rps-choice-btn rps-choice-btn--sheet"
                onClick={() => onChoose(c)}
                whileTap={{ scale: 0.92 }}
                transition={springTap}
              >
                <ChoiceEmoji choice={c} size={56} />
                {CHOICE_META[c].label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 참여자 화면의 가위바위보 게임 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function RpsPlayerView({ game, participantId }) {
  const { state, yourChoice, choose } = game;

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    const isFinalWinner = state.finalWinners?.some((w) => w.id === participantId);
    return (
      <section className="panel stack">
        <h2 className="panel__title">가위바위보 서바이벌 — 종료</h2>
        {isFinalWinner ? (
          <motion.p
            className="rps-final-banner"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springPop}
          >
            🏆 최종 승자입니다!
          </motion.p>
        ) : (
          <p className="rps-spectator">
            게임이 종료됐습니다. 최종 승자: {state.finalWinners?.map((w) => w.nickname).join(', ')}
          </p>
        )}
      </section>
    );
  }

  const inRound = state.activeParticipantIds.includes(participantId);
  const isConfirmedWinner = state.confirmedWinnerIds.includes(participantId);
  const waitingForChoice = inRound && state.status === 'selecting' && !yourChoice;

  return (
    <>
      <section className="panel stack">
        <h2 className="panel__title">가위바위보 서바이벌 — 라운드 {state.round}</h2>

        {!inRound && (
          <p className="rps-spectator">
            {isConfirmedWinner
              ? '다음 라운드 진출이 확정됐습니다. 잠시만 기다려주세요.'
              : '이번 게임에서 탈락했습니다. 계속 지켜봐주세요.'}
          </p>
        )}

        <AnimatePresence mode="wait">
          {waitingForChoice && (
            <motion.p
              key="waiting"
              className="rps-spectator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springPop}
            >
              아래에서 선택해주세요 👇
            </motion.p>
          )}

          {inRound && state.status === 'selecting' && yourChoice && (
            <motion.div
              key="chosen"
              className="rps-your-choice"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={springPop}
            >
              <ChoiceEmoji choice={yourChoice} size={56} />
              <p>선택 완료! 결과를 기다려주세요.</p>
            </motion.div>
          )}

          {inRound && state.status === 'locked' && (
            <motion.div
              key="locked"
              className="rps-your-choice"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springPop}
            >
              {yourChoice ? (
                <ChoiceEmoji choice={yourChoice} size={56} />
              ) : (
                <span className="rps-choice-emoji">🤔</span>
              )}
              <p>입력이 잠겼습니다. 두구두구…</p>
            </motion.div>
          )}

          {state.status === 'result' && state.roundResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springPop}
            >
              <RoundResult state={state} participantId={participantId} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <ChoiceSheet open={waitingForChoice} onChoose={choose} />
    </>
  );
}
