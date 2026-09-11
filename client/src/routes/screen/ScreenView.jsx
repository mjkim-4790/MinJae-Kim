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
import ChairsScreenView from '../../components/chairs/ChairsScreenView.jsx';
import MugunghwaScreenView from '../../components/mugunghwa/MugunghwaScreenView.jsx';
import ColorhuntScreenView from '../../components/colorhunt/ColorhuntScreenView.jsx';
import LaterpsScreenView from '../../components/laterps/LaterpsScreenView.jsx';
import SilhouetteScreenView from '../../components/silhouette/SilhouetteScreenView.jsx';
import PersonalColorScreenView from '../../components/personalcolor/PersonalColorScreenView.jsx';
import MazeScreenView from '../../components/maze/MazeScreenView.jsx';
import WordcloudScreenView from '../../components/wordcloud/WordcloudScreenView.jsx';
import YabawiScreenView from '../../components/yabawi/YabawiScreenView.jsx';
import { useAcrosticGame } from '../../hooks/useAcrosticGame.js';
import { useLiarGame } from '../../hooks/useLiarGame.js';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { useScoreboard } from '../../hooks/useScoreboard.js';
import { useTypingGame } from '../../hooks/useTypingGame.js';
import { useValuesGame } from '../../hooks/useValuesGame.js';
import { useYabawiGame } from '../../hooks/useYabawiGame.js';
import { useWordcloudGame } from '../../hooks/useWordcloudGame.js';
import { useMazeGame } from '../../hooks/useMazeGame.js';
import { useChairsGame } from '../../hooks/useChairsGame.js';
import { useMugunghwaGame } from '../../hooks/useMugunghwaGame.js';
import { useColorhuntGame } from '../../hooks/useColorhuntGame.js';
import { useLaterpsGame } from '../../hooks/useLaterpsGame.js';
import { useSilhouetteGame } from '../../hooks/useSilhouetteGame.js';
import { usePersonalColorGame } from '../../hooks/usePersonalColorGame.js';
import { socket } from '../../lib/socket.js';
import { arm as armSound } from '../../lib/screenSound.js';
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
  const yabawiGame = useYabawiGame({ eventCode: code, initialState: init?.yabawi });
  const wordcloudGame = useWordcloudGame({ eventCode: code, initialState: init?.wordcloud });
  const mazeGame = useMazeGame({ eventCode: code, initialState: init?.maze });
  const chairsGame = useChairsGame({ eventCode: code, initialState: init?.chairs });
  const mugunghwaGame = useMugunghwaGame({ eventCode: code, initialState: init?.mugunghwa });
  const colorhuntGame = useColorhuntGame({ eventCode: code, initialState: init?.colorhunt });
  const laterpsGame = useLaterpsGame({ eventCode: code, initialState: init?.laterps });
  const silhouetteGame = useSilhouetteGame({ eventCode: code, initialState: init?.silhouette });
  const personalColorGame = usePersonalColorGame({ eventCode: code, initialState: init?.personalcolor });
  const scoreboard = useScoreboard(init?.scoreboard);
  const joinUrl = joinUrlFor(code);

  // 소리는 화면 단위로 한 번만 연다 (screenSound.js 주석 참고)
  const [soundOn, setSoundOn] = useState(false);
  const enableSound = async () => setSoundOn(await armSound());

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

  // 지금 화면에 걸 게임을 고른다.
  //
  // 예전에는 위에서부터 "idle 이 아닌 첫 게임"을 골랐는데, 그러면 **끝난 게임이
  // 새로 시작한 게임을 가린다**. 색깔 사냥을 끝내고(상태 ended) 다음 게임을 시작해도
  // 대형화면에는 "색깔 사냥 종료"만 남아 있었다. 목록에서 앞자리인 게임일수록
  // 뒷자리 게임을 가리는 문제라 색깔 사냥만의 일이 아니었다.
  //
  // 그래서 두 단계로 고른다: **돌아가는 게임이 끝난 게임을 이긴다.**
  // 아무것도 안 돌아갈 때만 마지막 결과 화면을 계속 띄운다 (우승자를 보여줘야 하니까).
  // 활성 조건은 게임마다 다르다. 의자·무궁화는 라운드 사이에 잠깐 idle 로
  // 돌아가므로 round 까지 봐야 한다 — 기존 판정을 그대로 쓴다.
  const entries = [
    ['rps', rpsGame.state.status !== 'idle', rpsGame.state.status,
      () => <RpsScreenView state={rpsGame.state} />],
    ['liar', liarGame.state.status !== 'idle', liarGame.state.status,
      () => <LiarScreenView state={liarGame.state} participants={scoreboard.participants} />],
    ['typing', typingGame.state.status !== 'idle', typingGame.state.status,
      () => <TypingScreenView state={typingGame.state} />],
    ['acrostic', acrosticGame.state.status !== 'idle', acrosticGame.state.status,
      () => <AcrosticScreenView state={acrosticGame.state} />],
    ['values', valuesGame.state.status !== 'idle', valuesGame.state.status,
      () => <ValuesScreenView state={valuesGame.state} />],
    ['yabawi', yabawiGame.state.status !== 'idle', yabawiGame.state.status,
      () => <YabawiScreenView state={yabawiGame.state} />],
    ['wordcloud', wordcloudGame.state.status !== 'idle', wordcloudGame.state.status,
      () => <WordcloudScreenView state={wordcloudGame.state} />],
    ['colorhunt', colorhuntGame.state.status !== 'idle', colorhuntGame.state.status,
      () => <ColorhuntScreenView state={colorhuntGame.state} />],
    ['laterps', laterpsGame.state.status !== 'idle', laterpsGame.state.status,
      () => <LaterpsScreenView state={laterpsGame.state} sendGesture={laterpsGame.sendGesture} />],
    ['silhouette', silhouetteGame.state.status !== 'idle', silhouetteGame.state.status,
      () => <SilhouetteScreenView state={silhouetteGame.state} sendAngles={silhouetteGame.sendAngles} />],
    ['personalcolor', personalColorGame.state.status !== 'idle', personalColorGame.state.status,
      () => (
        <PersonalColorScreenView
          state={personalColorGame.state}
          sendSkin={personalColorGame.sendSkin}
          answer={personalColorGame.answer}
        />
      )],
    ['mugunghwa',
      mugunghwaGame.state.status !== 'idle' || mugunghwaGame.state.round > 0,
      mugunghwaGame.state.status,
      () => (
        <MugunghwaScreenView
          state={mugunghwaGame.state}
          serverTime={mugunghwaGame.serverTime}
          livePositions={mugunghwaGame.livePositions}
          soundOn={soundOn}
        />
      )],
    ['chairs',
      chairsGame.state.status !== 'idle' || chairsGame.state.round > 0,
      chairsGame.state.status,
      () => <ChairsScreenView state={chairsGame.state} serverTime={chairsGame.serverTime} soundOn={soundOn} />],
    ['maze', mazeGame.state.status !== 'idle', mazeGame.state.status,
      () => (
        <MazeScreenView
          state={mazeGame.state}
          serverTime={mazeGame.serverTime}
          livePositions={mazeGame.livePositions}
        />
      )],
  ];

  const shown =
    entries.find(([, active, status]) => active && status !== 'ended') ??
    entries.find(([, active]) => active) ??
    null;

  const gameActive = !!shown;
  const contentKey = gameActive ? 'game' : (mode ?? 'code');

  let content;
  if (shown) {
    content = shown[3]();
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
      {/* 게임과 무관하게 떠 있다 — 행사 준비할 때 한 번 누르면 모든 게임 소리가 살아난다 */}
      {!soundOn && (
        <button className="button screen__sound-arm" onClick={enableSound}>
          🔊 소리 켜기
        </button>
      )}
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
