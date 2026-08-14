import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import QrCode from '../../components/QrCode.jsx';
import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { socket } from '../../lib/socket.js';

// 대형 스크린 (설계문서 §5.3) — 조작 없는 표시 전용 화면.
// 대기 모드: 주최사 로고(행사 전) / 참여 QR + 코드. MC 가 운영자 화면에서 전환한다.
// 게임/순위 연출은 Phase 3~4.
export default function ScreenView() {
  const { code } = useParams();
  const { status, session, presence, init } = useRealtimeSession('screen', code);
  const joinUrl = `${window.location.origin}/join/${code}`;

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

  return (
    <main className="page page--screen">
      <StatusBar status={status} session={session} presence={presence} />

      {mode === 'logo' ? (
        <div className="screen__center">
          {event?.logoUrl ? (
            <img src={event.logoUrl} alt={event.name} className="screen__logo" />
          ) : (
            <p className="screen__eyebrow">{event?.name ?? '잠시만 기다려주세요'}</p>
          )}
        </div>
      ) : (
        <div className="screen__center">
          <QrCode value={joinUrl} size={280} />
          <p className="screen__eyebrow">참여 코드</p>
          <p className="screen__code">{code}</p>
          <p className="screen__hint">
            접속 {presence?.players ?? 0}명 · 브라우저를 전체화면(F11)으로 두세요
          </p>
        </div>
      )}
    </main>
  );
}
