import { useParams } from 'react-router-dom';

import QrCode from '../../components/QrCode.jsx';
import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';

// 대형 스크린 (설계문서 §5.3) — 조작 없는 표시 전용 화면.
// 대기 모드: 참여 QR + 코드 (§5.3). 주최사 로고 표시와 게임/순위 연출은 Phase 2~3.
export default function ScreenView() {
  const { code } = useParams();
  const { status, session, presence } = useRealtimeSession('screen', code);
  const joinUrl = `${window.location.origin}/join/${code}`;

  return (
    <main className="page page--screen">
      <StatusBar status={status} session={session} presence={presence} />

      <div className="screen__center">
        <QrCode value={joinUrl} size={280} />
        <p className="screen__eyebrow">참여 코드</p>
        <p className="screen__code">{code}</p>
        <p className="screen__hint">
          접속 {presence?.players ?? 0}명 · 브라우저를 전체화면(F11)으로 두세요
        </p>
      </div>
    </main>
  );
}
