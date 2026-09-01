import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AcrosticOperatorPanel from '../../components/acrostic/AcrosticOperatorPanel.jsx';
import ChatPanel from '../../components/ChatPanel.jsx';
import GamePicker from '../../components/games/GamePicker.jsx';
import LiarOperatorPanel from '../../components/liar/LiarOperatorPanel.jsx';
import QrCode from '../../components/QrCode.jsx';
import RankingBoard from '../../components/RankingBoard.jsx';
import RpsOperatorPanel from '../../components/rps/RpsOperatorPanel.jsx';
import TypingOperatorPanel from '../../components/typing/TypingOperatorPanel.jsx';
import ValuesOperatorPanel from '../../components/values/ValuesOperatorPanel.jsx';
import WordcloudOperatorPanel from '../../components/wordcloud/WordcloudOperatorPanel.jsx';
import YabawiOperatorPanel from '../../components/yabawi/YabawiOperatorPanel.jsx';
import { gameById } from '../../lib/games.js';
import { useAcrosticGame } from '../../hooks/useAcrosticGame.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useValuesGame } from '../../hooks/useValuesGame.js';
import { useYabawiGame } from '../../hooks/useYabawiGame.js';
import { useWordcloudGame } from '../../hooks/useWordcloudGame.js';
import { useChat } from '../../hooks/useChat.js';
import { useLiarGame } from '../../hooks/useLiarGame.js';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { useScoreboard } from '../../hooks/useScoreboard.js';
import { useTypingGame } from '../../hooks/useTypingGame.js';
import { socket } from '../../lib/socket.js';
import { api } from '../../lib/api.js';
import { isLocalOnlyOrigin, joinUrlFor, publicOrigin } from '../../lib/joinUrl.js';

const STATUS_LABEL = { scheduled: '대기', active: '진행중', ended: '종료' };
const MODE_LABEL = { individual: '개인전', team: '팀전' };
const SCREEN_MODE_LABEL = { logo: '로고 대기화면', qr: 'QR/코드 표시', ranking: '순위 표시' };
const TEAM_ERROR_MESSAGE = {
  INVALID_TEAM_COUNT: '팀 수를 2~10 사이로 입력하세요',
  TOO_MANY_TEAMS: '팀 수가 참여자 수보다 많습니다',
  NO_PARTICIPANTS: '아직 참여자가 없습니다',
};

export default function OperatorEventDetail() {
  const { id } = useParams();
  const { operator } = useAuth();
  // 일반인 전용 계정은 "게임" 탭(/home/game)에서 들어오므로 뒤로가기도 거기로,
  // MC 전용은 기존 그대로 /operator 이벤트 목록으로 (§7 공간 일관성).
  const backTo = operator?.accountType === 'personal' ? '/home/game' : '/operator';
  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(true);

  const load = useCallback(() => {
    api
      .getEvent(id)
      .then((res) => {
        setEvent(res.event);
        setParticipants(res.participants);
      })
      .catch(() => setError('이벤트 정보를 불러오지 못했습니다'));
  }, [id]);

  useEffect(load, [load]);

  // 이 이벤트의 실제 코드로 운영자 룸에 접속 — 참여자/스크린과 같은 룸에서 접속 현황을 본다
  const { presence, init } = useRealtimeSession('operator', event?.code);
  const chat = useChat(event?.code, init?.chat, true);
  const rpsGame = useRpsGame({ eventCode: event?.code, initialState: init?.rps });
  const liarGame = useLiarGame({ eventCode: event?.code, initialState: init?.liar });
  const typingGame = useTypingGame({ eventCode: event?.code, initialState: init?.typing });
  const acrosticGame = useAcrosticGame({ eventCode: event?.code, initialState: init?.acrostic });
  const valuesGame = useValuesGame({ eventCode: event?.code, initialState: init?.values });
  const yabawiGame = useYabawiGame({ eventCode: event?.code, initialState: init?.yabawi });
  const wordcloudGame = useWordcloudGame({ eventCode: event?.code, initialState: init?.wordcloud });
  const scoreboard = useScoreboard(init?.scoreboard);

  const [teamCount, setTeamCount] = useState(2);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState(null);
  const assignTeams = async () => {
    setTeamBusy(true);
    setTeamError(null);
    try {
      await api.assignTeams(id, teamCount);
      load();
    } catch (err) {
      setTeamError(TEAM_ERROR_MESSAGE[err.code] ?? '팀 배정에 실패했습니다');
    } finally {
      setTeamBusy(false);
    }
  };

  // 어떤 게임을 펼쳐볼지. null 이면 게임 선택 그리드를 보여준다.
  const [selectedGameId, setSelectedGameId] = useState(null);
  // 현재 서버에서 실제로 돌아가고 있는 게임 (동시에 하나만 돌아간다는 전제)
  const runningGameId =
    [
      ['rps', rpsGame],
      ['liar', liarGame],
      ['typing', typingGame],
      ['acrostic', acrosticGame],
      ['values', valuesGame],
      ['yabawi', yabawiGame],
      ['wordcloud', wordcloudGame],
    ].find(([, g]) => g.state.status !== 'idle')?.[0] ?? null;
  // 새로고침/재접속 시 진행 중인 게임이 있으면 그 화면으로 바로 들어간다.
  useEffect(() => {
    if (runningGameId) setSelectedGameId((cur) => cur ?? runningGameId);
  }, [runningGameId]);

  const [screenMode, setScreenModeState] = useState(null);
  useEffect(() => {
    if (init?.screenMode) setScreenModeState(init.screenMode);
  }, [init]);
  useEffect(() => {
    const onMode = ({ mode }) => setScreenModeState(mode);
    socket.on('screen:mode', onMode);
    return () => socket.off('screen:mode', onMode);
  }, []);
  const setScreenMode = (mode) =>
    socket.emit('screen:setMode', { eventCode: event.code, mode }, () => {});

  const runAction = async (action) => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'start') await api.startEvent(id);
      if (action === 'end') await api.endEvent(id);
      load();
    } catch {
      setError('상태 변경에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <main className="page">
        {error ? <p className="error-text">{error}</p> : <p className="subtitle">불러오는 중…</p>}
      </main>
    );
  }

  const joinUrl = joinUrlFor(event.code);
  // 로컬 개발에서 localhost 로 열었는데 LAN 주소조차 못 찾은 경우엔 QR 이 폰에서 안 열린다.
  const qrUnreachable = isLocalOnlyOrigin() && joinUrl.startsWith(window.location.origin);
  const scoreById = new Map(scoreboard.participants.map((p) => [p.id, p]));

  return (
    <main className="page">
      <Link to={backTo} className="back-link">
        ← 이벤트 목록
      </Link>

      {/* 스크롤해도 지금 진행 중인 이벤트·접속 현황이 항상 보인다 */}
      <div className="op-statusbar">
        <div className="op-statusbar__row">
          <span className={`badge badge--${event.status}`}>{STATUS_LABEL[event.status]}</span>
          <h1 className="op-statusbar__name">{event.name}</h1>
          <span className="op-statusbar__code">코드 {event.code}</span>
        </div>
        <div className="op-statusbar__live">
          <span>
            <b>{presence?.players ?? 0}</b> 참여자
          </span>
          <span>
            <b>{presence?.screens ?? 0}</b> 스크린
          </span>
          <span>
            <b>{presence?.operators ?? 0}</b> 운영자
          </span>
        </div>
      </div>

      <p className="subtitle" style={{ margin: 0 }}>
        {MODE_LABEL[event.mode]} · 최대 {event.maxParticipants}명
        {event.scheduledAt ? ` · ${new Date(event.scheduledAt).toLocaleString('ko-KR')}` : ''}
      </p>

      {/* 일반인 전용 계정만 보인다 — 이 게임은 진행자 1명이 맡아야 하므로, 직접 만든
          이벤트는 기본이 운영자 화면이고 참여자로 들어가려면 이렇게 전환한다
          (MC 전용은 진행에 전념하므로 이 전환이 필요 없다). */}
      {operator?.accountType === 'personal' && (
        <section className="panel stack role-switch-panel">
          <div className="role-switch">
            <span className="role-opt role-opt--active">운영자로 보기</span>
            <Link to={`/join/${event.code}`} className="role-opt">
              참여자로 입장하기
            </Link>
          </div>
          <p className="subtitle" style={{ margin: 0 }}>
            직접 만든 게임에 참여자로도 들어갈 수 있어요. QR/코드로 초대한 사람은 계정 없이도
            그대로 참여자 화면으로 들어옵니다.
          </p>
        </section>
      )}

      {event.logoUrl && (
        <img src={event.logoUrl} alt="이벤트 로고" className="event-logo-preview" />
      )}

      {event.status === 'scheduled' && (
        <section className="panel stack">
          <h2 className="panel__title">진행 제어</h2>
          <button className="button" disabled={busy} onClick={() => runAction('start')}>
            진행 시작
          </button>
          {error && <p className="error-text">{error}</p>}
        </section>
      )}

      <section className="panel stack">
        <div className="operator-topbar">
          <h2 className="panel__title" style={{ margin: 0 }}>
            참여 QR / 코드
          </h2>
          <button className="button button--ghost" onClick={() => setShowQr((v) => !v)}>
            {showQr ? '숨기기' : '표시하기'}
          </button>
        </div>
        {showQr && (
          <div className="join-display">
            <QrCode value={joinUrl} />
            <p className="screen__code join-display__code">{event.code}</p>
            <p className="subtitle">{joinUrl}</p>
            {qrUnreachable && (
              <p className="error-text">
                이 주소는 이 컴퓨터에서만 열립니다. 휴대폰으로 참여하려면 노트북의 Wi-Fi 주소
                (예: http://192.168.0.10:5173)로 접속한 뒤 이 화면을 다시 여세요.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2 className="panel__title">스크린에 띄울 화면</h2>
        <p className="subtitle">현재: {SCREEN_MODE_LABEL[screenMode] ?? '불러오는 중…'}</p>
        <div className="operator-topbar__actions">
          <button
            className={screenMode === 'logo' ? 'button' : 'button button--ghost'}
            onClick={() => setScreenMode('logo')}
          >
            로고 대기화면
          </button>
          <button
            className={screenMode === 'qr' ? 'button' : 'button button--ghost'}
            onClick={() => setScreenMode('qr')}
          >
            QR/코드 표시
          </button>
          <button
            className={screenMode === 'ranking' ? 'button' : 'button button--ghost'}
            onClick={() => setScreenMode('ranking')}
          >
            순위 표시
          </button>
        </div>
      </section>

      <section className="panel stack">
        <h2 className="panel__title">실시간 메시지</h2>
        <ChatPanel
          messages={chat.messages}
          pinnedMessage={chat.pinnedMessage}
          chatEnabled={chat.chatEnabled}
          autoScroll={chat.autoScroll}
          canSend
          onSend={chat.sendMessage}
          moderator={{
            onPin: chat.pinMessage,
            onDelete: chat.deleteMessage,
            onToggleChat: chat.setChatEnabled,
            onToggleAutoScroll: chat.setAutoScroll,
          }}
        />
      </section>

      <section className="panel stack">
        {selectedGameId ? (
          <>
            <div className="operator-topbar">
              <h2 className="panel__title" style={{ margin: 0 }}>
                {gameById(selectedGameId)?.name}
              </h2>
              <button className="button button--ghost" onClick={() => setSelectedGameId(null)}>
                ← 게임 목록
              </button>
            </div>
            {selectedGameId === 'rps' && (
              <RpsOperatorPanel
                game={rpsGame}
                participants={participants}
                activeParticipantCount={participants.filter((p) => p.status === 'active').length}
              />
            )}
            {selectedGameId === 'liar' && <LiarOperatorPanel game={liarGame} participants={participants} />}
            {selectedGameId === 'typing' && <TypingOperatorPanel game={typingGame} participants={participants} />}
            {selectedGameId === 'acrostic' && (
              <AcrosticOperatorPanel game={acrosticGame} participants={participants} />
            )}
            {selectedGameId === 'values' && (
              <ValuesOperatorPanel game={valuesGame} participants={participants} />
            )}
            {selectedGameId === 'yabawi' && (
              <YabawiOperatorPanel game={yabawiGame} participants={participants} />
            )}
            {selectedGameId === 'wordcloud' && <WordcloudOperatorPanel game={wordcloudGame} />}
          </>
        ) : (
          <>
            <h2 className="panel__title">게임</h2>
            <GamePicker onSelect={setSelectedGameId} runningGameId={runningGameId} />
          </>
        )}
      </section>

      <section className="panel stack">
        <h2 className="panel__title">순위</h2>
        <RankingBoard
          participants={scoreboard.participants}
          teamScores={scoreboard.teamScores}
          mode={event.mode}
        />
      </section>

      {event.mode === 'team' && (
        <section className="panel stack">
          <h2 className="panel__title">팀 자동 배정</h2>
          <p className="subtitle">
            현재 참여자를 무작위로 균등하게 팀에 배정합니다. 다시 누르면 전체를 새로
            섞어 재배정합니다.
          </p>
          <div className="operator-topbar__actions">
            <input
              className="input"
              type="number"
              min={2}
              max={10}
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
              style={{ maxWidth: 100 }}
            />
            <button className="button" disabled={teamBusy} onClick={assignTeams}>
              자동 배정
            </button>
          </div>
          {teamError && <p className="error-text">{teamError}</p>}
        </section>
      )}

      <section className="panel stack">
        <div className="operator-topbar">
          <h2 className="panel__title" style={{ margin: 0 }}>
            참여자 ({participants.length})
          </h2>
          <button className="button button--ghost" onClick={load}>
            새로고침
          </button>
        </div>
        {participants.length === 0 ? (
          <p className="subtitle">아직 참여자가 없습니다.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>닉네임</th>
                {event.mode === 'team' && <th>팀</th>}
                <th>점수</th>
                <th>상태</th>
                <th>참여 시각</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const live = scoreById.get(p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.nickname}</td>
                    {event.mode === 'team' && <td>{live?.teamId ? `${live.teamId}팀` : '-'}</td>}
                    <td>{live?.score ?? p.score}</td>
                    <td>{p.status}</td>
                    <td>{new Date(p.joinedAt).toLocaleString('ko-KR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 자주 쓰는 동작을 스크롤 없이 항상 누를 수 있게 화면 하단에 고정 */}
      <div className="op-actionbar">
        {error && <p className="error-text" style={{ flexBasis: '100%' }}>{error}</p>}
        <Link className="button button--ghost" to={`/screen/${event.code}`} target="_blank">
          화면공유 열기
        </Link>
        {event.status !== 'ended' && (
          <button className="button button--danger" disabled={busy} onClick={() => runAction('end')}>
            이벤트 종료
          </button>
        )}
      </div>
    </main>
  );
}
