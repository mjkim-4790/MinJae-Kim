import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';

import friendsLogo from '../../assets/friends-logo.png';
import AcrosticScreenView from '../../components/acrostic/AcrosticScreenView.jsx';
import LiarScreenView from '../../components/liar/LiarScreenView.jsx';
import QrCode from '../../components/QrCode.jsx';
import RankingBoard from '../../components/RankingBoard.jsx';
import RpsScreenView from '../../components/rps/RpsScreenView.jsx';
import StatusBar from '../../components/StatusBar.jsx';
import TypingScreenView from '../../components/typing/TypingScreenView.jsx';
import ValuesScreenView from '../../components/values/ValuesScreenView.jsx';
import { useAcrosticGame } from '../../hooks/useAcrosticGame.js';
import { useLiarGame } from '../../hooks/useLiarGame.js';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { useScoreboard } from '../../hooks/useScoreboard.js';
import { useTypingGame } from '../../hooks/useTypingGame.js';
import { useValuesGame } from '../../hooks/useValuesGame.js';
import { socket } from '../../lib/socket.js';
import { joinUrlFor } from '../../lib/joinUrl.js';

// 모드가 바뀔 때마다 "새 화면이 도착한다"는 느낌을 주는 크로스페이드+스케일 전환.
const materialize = { type: 'spring', bounce: 0.15, duration: 0.5 };

// 로고 무지개 6색 리본 — 대기 화면(로고/QR/순위) 공통 하단 장식
function RainbowRibbon() {
  return (
    <div className="screen__ribbon" aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </div>
  );
}

// 대형 스크린 (설계문서 §5.3) — 조작 없는 표시 전용 화면.
// 대기 모드: 주최사 로고(행사 전) / 참여 QR + 코드 / 누적 순위. 게임이 진행 중이면
// 자동으로 게임 연출로 전환되고, 게임이 끝나면 다시 MC 가 고른 모드로 돌아간다.
export default function ScreenView() {
  const { code } = useParams();
  const { status, session, presence, init } = useRealtimeSession('screen', code);
  const rpsGame = useRpsGame({ eventCode: code, initialState: init?.rps });
  const liarGame = useLiarGame({ eventCode: code, initialState: init?.liar });
  const typingGame = useTypingGame({ eventCode: code, initialState: init?.typing });
  const acrosticGame = useAcrosticGame({ eventCode: code, initialState: init?.acrostic });
  const valuesGame = useValuesGame({ eventCode: code, initialState: init?.values });
  const scoreboard = useScoreboard(init?.scoreboard);
  const joinUrl = joinUrlFor(code);

  const [mode, setMode] = useState(null);
  useEffect(() => {
    if (init?.screenMode) setMode(init.screenMode);
  }, [init]);
  useEffect(() => {
    const onMode = ({ mode: next }) => setMode(next);
    socket.on('screen:mode', onMode);
    return () => socket.off('screen:mode', onMode);
  }, []);

  const event = init?.event;
  const rpsActive = rpsGame.state.status !== 'idle';
  const liarActive = liarGame.state.status !== 'idle';
  const typingActive = typingGame.state.status !== 'idle';
  const acrosticActive = acrosticGame.state.status !== 'idle';
  const valuesActive = valuesGame.state.status !== 'idle';
  const gameActive = rpsActive || liarActive || typingActive || acrosticActive || valuesActive;
  const contentKey = gameActive ? 'game' : (mode ?? 'code');

  let content;
  if (rpsActive) {
    content = <RpsScreenView state={rpsGame.state} />;
  } else if (liarActive) {
    content = <LiarScreenView state={liarGame.state} participants={scoreboard.participants} />;
  } else if (typingActive) {
    content = <TypingScreenView state={typingGame.state} />;
  } else if (acrosticActive) {
    content = <AcrosticScreenView state={acrosticGame.state} />;
  } else if (valuesActive) {
    content = <ValuesScreenView state={valuesGame.state} />;
  } else if (mode === 'logo') {
    content = (
      <div className="screen__frame">
        <div className="screen__top">
          <img src={friendsLogo} alt="Friends" className="screen__brand" />
          <p className="screen__presence">
            접속 <b>{presence?.players ?? 0}</b>명
          </p>
        </div>
        <div className="screen__mid">
          {event?.logoUrl ? (
            <img src={event.logoUrl} alt={event.name} className="screen__logo" />
          ) : (
            <p className="screen__eyebrow">{event?.name ?? '잠시만 기다려주세요'}</p>
          )}
        </div>
        <RainbowRibbon />
      </div>
    );
  } else if (mode === 'ranking') {
    content = (
      <div className="screen__frame">
        <div className="screen__top">
          <img src={friendsLogo} alt="Friends" className="screen__brand" />
          <p className="screen__presence">
            접속 <b>{presence?.players ?? 0}</b>명
          </p>
        </div>
        <div className="screen__mid" style={{ flexDirection: 'column', gap: 'clamp(16px, 2vw, 28px)' }}>
          <p className="screen__eyebrow">누적 순위</p>
          <RankingBoard
            participants={scoreboard.participants}
            teamScores={scoreboard.teamScores}
            mode={event?.mode}
            large
          />
        </div>
        <RainbowRibbon />
      </div>
    );
  } else {
    content = (
      <div className="screen__frame">
        <div className="screen__top">
          <img src={friendsLogo} alt="Friends" className="screen__brand" />
          <p className="screen__presence">
            접속 <b>{presence?.players ?? 0}</b>명
          </p>
        </div>
        <div className="screen__mid">
          <div className="screen__code-row">
            <div className="screen__code-col">
              <p className="screen__eyebrow">참여 코드</p>
              <p className="screen__code">{code}</p>
              <p className="screen__hint">브라우저를 전체화면(F11)으로 두세요</p>
            </div>
            <QrCode value={joinUrl} size={200} />
          </div>
        </div>
        <RainbowRibbon />
      </div>
    );
  }

  return (
    <main className="page page--screen">
      <StatusBar status={status} session={session} presence={presence} />
      <AnimatePresence mode="wait">
        <motion.div
          key={contentKey}
          className="screen__motion-wrap"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={materialize}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
