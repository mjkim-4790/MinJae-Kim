import PersonalLayout from '../../components/personal/PersonalLayout.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getMonthGrid, WEEKDAY_LABELS } from '../../lib/calendar.js';

// 홈 화면 — 가족과 연동해 일정을 함께 볼 예정인 달력 (사용자 결정: 일기 카테고리의
// 개인 달력과는 완전히 별개). 지금은 가족 연동 전이라 오늘 날짜 표시만 한다.
export default function PersonalHome() {
  const { operator } = useAuth();

  const today = new Date();
  const cells = getMonthGrid(today.getFullYear(), today.getMonth());

  return (
    <PersonalLayout>
      <main className="page personal-home">
        <header className="personal-home__header">
          <div>
            <p className="subtitle">안녕하세요</p>
            <h1 className="personal-home__name">{operator?.name}님</h1>
          </div>
        </header>

        <section className="home-cal">
          <div className="home-cal__head">
            <span className="home-cal__eyebrow">가족 일정 (일기 달력과는 별개 · 추후 가족 연동 예정)</span>
            <span className="home-cal__month">
              {today.getFullYear()}년 {today.getMonth() + 1}월
            </span>
          </div>
          <div className="home-cal__weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="home-cal__grid">
            {cells.map((cell, i) => (
              <span key={i} className={`cal-cell${cell.date === today.getDate() ? ' cal-cell--today' : ''}`}>
                {cell.date && <span className="cal-cell__num">{cell.date}</span>}
              </span>
            ))}
          </div>
          <p className="home-cal__foot">지금은 나만 보이지만, 가족을 연결하면 서로의 일정이 여기 함께 떠요.</p>
        </section>
      </main>
    </PersonalLayout>
  );
}
