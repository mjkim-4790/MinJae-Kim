import { useParams } from 'react-router-dom';

import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';

// 참여자 화면 (설계문서 §5.2)
// Phase 0: QR/코드로 들어온 이벤트 코드의 룸에 붙는 것까지.
// 닉네임+숫자4자리 프로필과 재접속 복구는 Phase 1.
export default function PlayerJoin() {
  const { code } = useParams();
  const { status, session, presence } = useRealtimeSession('player', code);

  return (
    <main className="page">
      <StatusBar status={status} session={session} presence={presence} />

      <header className="stack">
        <h1 className="title">참여자 화면</h1>
        <p className="subtitle">
          참여 코드 <strong>{code}</strong> 로 입장했습니다.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel__title">다음 단계에서 붙는 기능</h2>
        <ul className="checklist">
          <li>Phase 1 — 닉네임 + 숫자 4자리 프로필, 재접속 시 점수 복구</li>
          <li>Phase 2 — 대기 화면, 실시간 메시지 보기</li>
          <li>Phase 3 — 가위·바위·보 컨트롤러, 관전 모드</li>
        </ul>
      </section>
    </main>
  );
}
