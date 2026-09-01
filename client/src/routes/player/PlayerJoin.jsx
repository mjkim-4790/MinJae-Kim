import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import friendsLogo from '../../assets/friends-logo.png';
import AcrosticPlayerView from '../../components/acrostic/AcrosticPlayerView.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import LiarPlayerView from '../../components/liar/LiarPlayerView.jsx';
import RankingBoard from '../../components/RankingBoard.jsx';
import RpsPlayerView from '../../components/rps/RpsPlayerView.jsx';
import TypingPlayerView from '../../components/typing/TypingPlayerView.jsx';
import ValuesPlayerView from '../../components/values/ValuesPlayerView.jsx';
import WordcloudPlayerView from '../../components/wordcloud/WordcloudPlayerView.jsx';
import YabawiPlayerView from '../../components/yabawi/YabawiPlayerView.jsx';
import { useAcrosticGame } from '../../hooks/useAcrosticGame.js';
import { useValuesGame } from '../../hooks/useValuesGame.js';
import { useYabawiGame } from '../../hooks/useYabawiGame.js';
import { useWordcloudGame } from '../../hooks/useWordcloudGame.js';
import { useChat } from '../../hooks/useChat.js';
import { useLiarGame } from '../../hooks/useLiarGame.js';
import { usePlayerConnection } from '../../hooks/usePlayerConnection.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { useScoreboard } from '../../hooks/useScoreboard.js';
import { useTypingGame } from '../../hooks/useTypingGame.js';

const ERROR_MESSAGE = {
  EVENT_NOT_FOUND: '존재하지 않거나 종료된 코드입니다',
  EVENT_FULL: '정원이 가득 찼습니다',
  INVALID_PIN: '숫자 4자리를 입력하세요',
  NICKNAME_REQUIRED: '닉네임을 입력하세요',
  PARTICIPANT_REMOVED: '운영자에 의해 제외된 참여자입니다',
};

const MODE_LABEL = { individual: '개인전', team: '팀전' };

function storageKey(code) {
  return `recreation:player:${code}`;
}

export default function PlayerJoin() {
  const { code } = useParams();
  const {
    status,
    participant,
    event,
    chat: initialChat,
    rps: initialRps,
    yourRpsChoice: initialYourRpsChoice,
    liar: initialLiar,
    yourLiarWord: initialYourLiarWord,
    typingGame: initialTypingGame,
    acrostic: initialAcrostic,
    yourAcrosticEntry: initialYourAcrosticEntry,
    values: initialValues,
    yourValuesState: initialYourValuesState,
    yabawi: initialYabawi,
    yourYabawiPick: initialYourYabawiPick,
    wordcloud: initialWordcloud,
    yourWordcloudWords: initialYourWordcloudWords,
    scoreboard: initialScoreboard,
    error,
    join,
  } = usePlayerConnection(code);
  const chat = useChat(code, initialChat, false);
  const rpsGame = useRpsGame({
    eventCode: code,
    participantId: participant?.id ?? null,
    initialState: initialRps,
    initialYourChoice: initialYourRpsChoice,
  });
  const liarGame = useLiarGame({
    eventCode: code,
    participantId: participant?.id ?? null,
    initialState: initialLiar,
    initialYourWord: initialYourLiarWord,
  });
  const typingGame = useTypingGame({ eventCode: code, initialState: initialTypingGame });
  const acrosticGame = useAcrosticGame({
    eventCode: code,
    initialState: initialAcrostic,
    initialYourEntry: initialYourAcrosticEntry,
  });
  const valuesGame = useValuesGame({
    eventCode: code,
    initialState: initialValues,
    initialYours: initialYourValuesState,
  });
  const yabawiGame = useYabawiGame({
    eventCode: code,
    initialState: initialYabawi,
    initialYourPick: initialYourYabawiPick,
  });
  const wordcloudGame = useWordcloudGame({
    eventCode: code,
    initialState: initialWordcloud,
    initialYourWords: initialYourWordcloudWords,
  });
  const scoreboard = useScoreboard(initialScoreboard);
  // 서버가 이미 점수 내림차순으로 정렬해서 주므로(§ participants.js), 배열 순서 = 순위다.
  const myRankIndex = scoreboard.participants.findIndex((p) => p.id === participant?.id);
  const myScore = myRankIndex >= 0 ? scoreboard.participants[myRankIndex].score : 0;

  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const autoTriedRef = useRef(false);

  // 이전에 이 코드로 입장한 적 있으면 자동으로 다시 시도 (기억 못해도 편하게, 실패하면 폼으로 대체)
  useEffect(() => {
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    const saved = localStorage.getItem(storageKey(code));
    if (!saved) return;
    try {
      const { nickname: savedNickname, pin: savedPin } = JSON.parse(saved);
      setNickname(savedNickname ?? '');
      setPin(savedPin ?? '');
      if (savedNickname && savedPin) join(savedNickname, savedPin);
    } catch {
      // 저장된 값이 손상됐으면 무시하고 폼을 보여준다
    }
  }, [code, join]);

  useEffect(() => {
    if (status === 'joined' && participant) {
      localStorage.setItem(storageKey(code), JSON.stringify({ nickname: participant.nickname, pin }));
    }
  }, [status, participant, code, pin]);

  const submit = (e) => {
    e.preventDefault();
    join(nickname.trim(), pin);
  };

  // 게임이 돌아가는 동안은 게임 화면만 남긴다 — 참여자가 지금 뭘 해야 하는지에만 집중하도록.
  // 종료 후 참여자가 "확인"을 누르면(dismissed) 운영자가 리셋하기 전이라도 각자
  // 원래 화면(점수/채팅/순위)으로 돌아갈 수 있다 (세 게임 모두 동일).
  const gameRunning = [
    rpsGame,
    liarGame,
    typingGame,
    acrosticGame,
    valuesGame,
    yabawiGame,
    wordcloudGame,
  ].some(
    (g) => g.state.status !== 'idle' && !g.dismissed,
  );

  if (status === 'joined' || status === 'reconnecting') {
    return (
      <main className="page">
        <img src={friendsLogo} alt="Friends" className="player-corner-logo" />
        {status === 'reconnecting' && (
          <p className="badge badge--info">연결이 끊겨 다시 연결하는 중…</p>
        )}
        <header className="stack">
          <h1 className="title player-nickname">{participant?.nickname}</h1>
          <p className="subtitle">
            {event?.name} · {MODE_LABEL[event?.mode] ?? event?.mode}
          </p>
        </header>

        {!gameRunning && (
          <section className="panel stack">
            <h2 className="panel__title">내 누적 점수</h2>
            <div className="stat-number-row">
              <p className="stat-number">{myScore}</p>
              {myRankIndex >= 0 && (
                <span className="stat-position">
                  {myRankIndex + 1}위 / {scoreboard.participants.length}명
                </span>
              )}
            </div>
          </section>
        )}

        <RpsPlayerView game={rpsGame} participantId={participant?.id} />
        <LiarPlayerView
          game={liarGame}
          participantId={participant?.id}
          participants={scoreboard.participants}
        />
        <TypingPlayerView game={typingGame} participantId={participant?.id} />
        <AcrosticPlayerView game={acrosticGame} participantId={participant?.id} />
        <ValuesPlayerView game={valuesGame} participantId={participant?.id} />
        <YabawiPlayerView game={yabawiGame} participantId={participant?.id} />
        <WordcloudPlayerView game={wordcloudGame} />

        {!gameRunning && (
          <>
            <section className="panel stack">
              <h2 className="panel__title">실시간 메시지</h2>
              <ChatPanel
                messages={chat.messages}
                pinnedMessage={chat.pinnedMessage}
                chatEnabled={chat.chatEnabled}
                autoScroll={chat.autoScroll}
                canSend={chat.chatEnabled}
                onSend={chat.sendMessage}
              />
            </section>

            <section className="panel stack">
              <h2 className="panel__title">순위</h2>
              <RankingBoard
                participants={scoreboard.participants}
                teamScores={scoreboard.teamScores}
                mode={event?.mode}
              />
            </section>

            <p className="subtitle">
              닉네임과 숫자를 기억하세요! 연결이 끊겨도 다시 들어올 수 있어요.
            </p>
          </>
        )}
      </main>
    );
  }

  if (status === 'kicked') {
    return (
      <main className="page page--center">
        <div className="stack">
          <h1 className="title">연결이 종료됐어요</h1>
          <p className="subtitle">
            같은 닉네임과 숫자로 다른 기기에서 접속되어 이 화면의 연결이 끊겼습니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page page--center">
      <img src={friendsLogo} alt="Friends" className="player-corner-logo" />
      <form className="stack" style={{ width: 'min(360px, 100%)' }} onSubmit={submit}>
        <h1 className="title">참여자 입장</h1>
        <p className="subtitle">
          닉네임과 본인만의 숫자 4자리를 정해주세요. 연결이 끊겨도 같은 정보로 다시 들어오면
          점수 그대로 이어집니다.
        </p>

        <input
          className="input"
          placeholder="이름 또는 닉네임"
          maxLength={12}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
        />
        <input
          className="input input--code"
          inputMode="numeric"
          placeholder="0000"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          required
        />

        {error && <p className="error-text">{ERROR_MESSAGE[error] ?? '입장에 실패했습니다'}</p>}

        <button
          className="button"
          type="submit"
          disabled={status === 'connecting' || nickname.trim().length === 0 || pin.length !== 4}
        >
          {status === 'connecting' ? '입장하는 중…' : '입장하기'}
        </button>
      </form>
    </main>
  );
}
