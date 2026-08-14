const LABEL = {
  connected: '연결됨',
  connecting: '연결 중…',
  disconnected: '연결 끊김 — 재연결 시도 중',
};

/** 개발/리허설용 연결 상태 표시. 실전 화면 디자인은 Phase 5 에서 정리한다. */
export default function StatusBar({ status, session, presence }) {
  return (
    <div className="statusbar">
      <span className={`dot dot--${status}`} aria-hidden="true" />
      <span className="statusbar__label">{LABEL[status] ?? status}</span>
      {session && (
        <span className="statusbar__meta">
          룸 {session.eventCode} · {session.role}
        </span>
      )}
      {presence && (
        <span className="statusbar__meta">
          운영자 {presence.operators} · 참여자 {presence.players} · 스크린{' '}
          {presence.screens}
        </span>
      )}
    </div>
  );
}
