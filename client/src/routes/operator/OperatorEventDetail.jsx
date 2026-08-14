import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import ChatPanel from '../../components/ChatPanel.jsx';
import QrCode from '../../components/QrCode.jsx';
import RpsOperatorPanel from '../../components/rps/RpsOperatorPanel.jsx';
import { useChat } from '../../hooks/useChat.js';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { socket } from '../../lib/socket.js';
import { api } from '../../lib/api.js';

const STATUS_LABEL = { scheduled: '대기', active: '진행중', ended: '종료' };
const MODE_LABEL = { individual: '개인전', team: '팀전' };
const SCREEN_MODE_LABEL = { logo: '로고 대기화면', qr: 'QR/코드 표시' };

export default function OperatorEventDetail() {
  const { id } = useParams();
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

  const joinUrl = `${window.location.origin}/join/${event.code}`;

  return (
    <main className="page">
      <Link to="/operator" className="back-link">
        ← 이벤트 목록
      </Link>

      <header className="stack">
        <span className={`badge badge--${event.status}`}>{STATUS_LABEL[event.status]}</span>
        <h1 className="title">{event.name}</h1>
        <p className="subtitle">
          {MODE_LABEL[event.mode]} · 최대 {event.maxParticipants}명
          {event.scheduledAt ? ` · ${new Date(event.scheduledAt).toLocaleString('ko-KR')}` : ''}
        </p>
      </header>

      {event.logoUrl && (
        <img src={event.logoUrl} alt="이벤트 로고" className="event-logo-preview" />
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
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2 className="panel__title">진행 제어</h2>
        <p className="subtitle">
          실시간 접속 — 운영자 {presence?.operators ?? 0} · 참여자 {presence?.players ?? 0} ·
          스크린 {presence?.screens ?? 0}
        </p>
        <div className="operator-topbar__actions">
          {event.status === 'scheduled' && (
            <button className="button" disabled={busy} onClick={() => runAction('start')}>
              진행 시작
            </button>
          )}
          {event.status !== 'ended' && (
            <button className="button button--danger" disabled={busy} onClick={() => runAction('end')}>
              이벤트 종료
            </button>
          )}
          <Link className="button button--ghost" to={`/screen/${event.code}`} target="_blank">
            화면공유
          </Link>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel stack">
        <h2 className="panel__title">대형 스크린 화면</h2>
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
        </div>
      </section>

      <section className="panel stack">
        <h2 className="panel__title">가위바위보 서바이벌</h2>
        <RpsOperatorPanel
          game={rpsGame}
          participants={participants}
          activeParticipantCount={participants.filter((p) => p.status === 'active').length}
        />
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
                <th>점수</th>
                <th>상태</th>
                <th>참여 시각</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td>{p.nickname}</td>
                  <td>{p.score}</td>
                  <td>{p.status}</td>
                  <td>{new Date(p.joinedAt).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
