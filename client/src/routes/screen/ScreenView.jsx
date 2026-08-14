import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import QrCode from '../../components/QrCode.jsx';
import RpsScreenView from '../../components/rps/RpsScreenView.jsx';
import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';
import { useRpsGame } from '../../hooks/useRpsGame.js';
import { socket } from '../../lib/socket.js';

// 대형 스크린 (설계문서 §5.3) — 조작 없는 표시 전용 화면.
// 대기 모드: 주최사 로고(행사 전) / 참여 QR + 코드. 게임이 진행 중이면 자동으로
// 게임 연출로 전환되고, 게임이 끝나면 다시 로고/QR 모드로 돌아간다.
export default function ScreenView() {
  const { code } = useParams();
  const { status, session, presence, init } = useRealtimeSession('screen', code);
  const rpsGame = useRpsGame({ eventCode: code, initialState: init?.rps });
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
  const gameActive = rpsGame.state.status !== 'idle';

  return (
    <main className="page page--screen">
      <StatusBar status={status} session={session} presence={presence} />

      {gameActive ? (
        <RpsScreenView state={rpsGame.state} />
      ) : mode === 'logo' ? (
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
