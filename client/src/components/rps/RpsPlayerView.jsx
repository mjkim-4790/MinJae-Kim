import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { ChoiceEmoji } from './ChoiceEmoji.jsx';
import { springPop, springSettle, springTap } from '../../lib/motionPresets.js';
import { CHOICE_META, CHOICES } from '../../lib/rps.js';

// 하단 고정 선택 시트 전용 스프링 — Apple 이 "Drawer / sheet" 에 쓰는 값(damping 0.8,
// response 0.3)에 가깝게 맞춘 살짝의 바운스. 큰 리빌(springPop)보다는 차분하다.
const sheetSpring = { type: 'spring', bounce: 0.2, duration: 0.35 };

// 이 라운드에서 나에게 무슨 일이 있었는지 — 한 단어로 크게 알려준다
const VERDICT = {
  win: { label: '승!', modifier: 'rps-verdict--win' },
  lose: { label: '패!', modifier: 'rps-verdict--lose' },
  draw: { label: '비김!', modifier: 'rps-verdict--lose' },
  none: { label: '미선택', modifier: 'rps-verdict--none' },
};

function verdictKey({ won, yourChoice, operatorChoice }) {
  if (won) return 'win';
  if (!yourChoice) return 'none';
  return yourChoice === operatorChoice ? 'draw' : 'lose';
}

function branchMessage(outcome, won) {
  if (outcome === 'wipeout') return '전멸! 같은 인원으로 다시 대결합니다.';
  if (won) return outcome === 'ended' ? '목표 달성! 최종 생존했습니다 🎉' : '생존했습니다! 다음 라운드로';
  return outcome === 'ended' || outcome === 'overshoot'
    ? '탈락했습니다'
    : '탈락 — 패자부활전에서 다시 도전합니다';
}

/** 점들이 원을 그리며 차례로 흐려지는 대기 애니메이션 (§14 축소 모션에서는 정지). */
function WaitingDots() {
  return (
    <span className="loading-dots" role="status" aria-label="기다리는 중">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="loading-dots__dot" style={{ '--i': i }} />
      ))}
    </span>
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

// 라운드 결과 모달. 딤 처리한 배경 위로 진행자의 선택이 튀어나오고, 바로 아래에
// 승/패/비김을 크게 박아준다 (§12 딤으로 집중, §7 나타난 자리로 다시 사라짐).
function ResultModal({ open, state, participantId, yourChoice, onClose }) {
  const result = state.roundResult;
  const won = !!result && result.winners.some((w) => w.id === participantId);
  const verdict = VERDICT[verdictKey({ won, yourChoice, operatorChoice: state.operatorChoice })];

  return (
    <AnimatePresence>
      {open && result && (
        <motion.div
          className="rps-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springSettle}
          onClick={onClose}
        >
          <motion.div
            className="rps-modal"
            initial={{ opacity: 0, scale: 0.86, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 14 }}
            transition={springPop}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="rps-modal__eyebrow">진행자의 선택</p>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springPop, delay: 0.08 }}
            >
              <ChoiceEmoji choice={state.operatorChoice} size={104} />
            </motion.div>
            <motion.p
              className={`rps-verdict ${verdict.modifier}`}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springPop, delay: 0.18 }}
            >
              {verdict.label}
            </motion.p>
            <p className="rps-modal__note">{branchMessage(result.branchOutcome, won)}</p>
            <motion.button
              className="button rps-modal__button"
              onClick={onClose}
              whileTap={{ scale: 0.96 }}
              transition={springTap}
            >
              확인
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 참여자 화면의 가위바위보 게임 영역. status==='idle' 이면 아무것도 렌더링하지 않는다. */
export default function RpsPlayerView({ game, participantId }) {
  const { state, yourChoice, choose } = game;
  const [resultDismissed, setResultDismissed] = useState(false);

  // 결과 단계를 벗어나면 다음 라운드 결과를 다시 볼 수 있도록 초기화
  useEffect(() => {
    if (state.status !== 'result') setResultDismissed(false);
  }, [state.status]);

  if (state.status === 'idle') return null;

  if (state.status === 'ended') {
    const isFinalWinner = state.finalWinners?.some((w) => w.id === participantId);
    return (
      <section className="panel stack rps-stage">
        <h2 className="rps-round-title">가위바위보 서바이벌 — 종료</h2>
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
  const showResult = inRound && state.status === 'result' && !resultDismissed;
  const waitingLabel = state.status === 'result' ? '다음 라운드 기다리는 중' : '상대방 기다리는 중';

  return (
    <>
      <section className="panel stack rps-stage">
        <h2 className="rps-round-title">가위바위보 서바이벌 — 라운드 {state.round}</h2>

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
              key="hint"
              className="rps-stage__hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={springSettle}
            >
              아래에서 선택해주세요 👇
            </motion.p>
          )}

          {inRound && !waitingForChoice && (
            <motion.div
              key="waiting"
              className="rps-waiting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={springPop}
            >
              {yourChoice ? (
                <ChoiceEmoji choice={yourChoice} size={64} />
              ) : (
                <span className="rps-choice-emoji">❓</span>
              )}
              <p className="rps-waiting__text">{waitingLabel}</p>
              <WaitingDots />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <ChoiceSheet open={waitingForChoice} onChoose={choose} />
      <ResultModal
        open={showResult}
        state={state}
        participantId={participantId}
        yourChoice={yourChoice}
        onClose={() => setResultDismissed(true)}
      />
    </>
  );
}
