import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.jsx';
import { api } from '../../lib/api.js';

const STATUS_LABEL = { scheduled: '대기', active: '진행중', ended: '종료' };
const MODE_LABEL = { individual: '개인전', team: '팀전' };

function EventCard({ event }) {
  return (
    <Link to={`/operator/events/${event.id}`} className="event-card">
      <div className="event-card__head">
        <span className={`badge badge--${event.status}`}>{STATUS_LABEL[event.status]}</span>
        <span className="event-card__code">#{event.code}</span>
      </div>
      <h3 className="event-card__name">{event.name}</h3>
      <p className="event-card__meta">
        {MODE_LABEL[event.mode]} · 최대 {event.maxParticipants}명
        {event.scheduledAt ? ` · ${new Date(event.scheduledAt).toLocaleString('ko-KR')}` : ''}
      </p>
    </Link>
  );
}

export default function OperatorEvents() {
  const { operator, logout } = useAuth();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listEvents()
      .then((res) => setEvents(res.events))
      .catch(() => setError('이벤트 목록을 불러오지 못했습니다'));
  }, []);

  const upcoming = events?.filter((e) => e.status !== 'ended') ?? [];
  const past = events?.filter((e) => e.status === 'ended') ?? [];

  return (
    <main className="page">
      <header className="operator-topbar">
        <div>
          <p className="subtitle">{operator?.name} 님</p>
          <h1 className="title">이벤트</h1>
        </div>
        <div className="operator-topbar__actions">
          <Link className="button" to="/operator/new">
            + 새 이벤트
          </Link>
          <button className="button button--ghost" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="stack">
        <h2 className="panel__title">진행 예정 / 진행 중</h2>
        {upcoming.length === 0 ? (
          <p className="subtitle">아직 개설한 이벤트가 없습니다.</p>
        ) : (
          <div className="event-grid">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="stack">
          <h2 className="panel__title">지난 이벤트 이력</h2>
          <div className="event-grid">
            {past.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
