import { useParams } from 'react-router-dom';

import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';

// 대형 스크린 (설계문서 §5.3) — 조작 없는 표시 전용 화면.
// Phase 0: 대기 모드 뼈대만. 로고/QR 대기화면은 Phase 2, 게임 연출은 Phase 3.
export default function ScreenView() {
  const { code } = useParams();
  const { status, session, presence } = useRealtimeSession('screen', code);

  return (
    <main className="page page--screen">
      <StatusBar status={status} session={session} presence={presence} />

      <div className="screen__center">
        <p className="screen__eyebrow">참여 코드</p>
        <p className="screen__code">{code}</p>
        <p className="screen__hint">
          접속 {presence?.players ?? 0}명 · 브라우저를 전체화면(F11)으로 두세요
        </p>
      </div>
    </main>
  );
}
