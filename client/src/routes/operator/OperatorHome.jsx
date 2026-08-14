import StatusBar from '../../components/StatusBar.jsx';
import { useRealtimeSession } from '../../hooks/useRealtimeSession.js';

// 운영자 화면 (설계문서 §5.1)
// Phase 0: 소켓 연결과 룸 접속만 확인. 로그인·이벤트 CRUD 는 Phase 1.
export default function OperatorHome() {
  const { status, session, presence } = useRealtimeSession('operator');

  return (
    <main className="page">
      <StatusBar status={status} session={session} presence={presence} />

      <header className="stack">
        <h1 className="title">운영자 화면</h1>
        <p className="subtitle">
          MC 전용 컨트롤러입니다. 정답·컨트롤이 노출되므로 대형 스크린에 미러링하지
          마세요.
        </p>
      </header>

      <section className="panel">
        <h2 className="panel__title">다음 단계에서 붙는 기능</h2>
        <ul className="checklist">
          <li>Phase 1 — 로그인, 이벤트 개설/리스트/이력, 4자리 코드, QR</li>
          <li>Phase 2 — 실시간 접속 현황, 메시지 송출, 스크린 제어</li>
          <li>Phase 3 — 가위바위보 서바이벌 진행</li>
        </ul>
      </section>
    </main>
  );
}
