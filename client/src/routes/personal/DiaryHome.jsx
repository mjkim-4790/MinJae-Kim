import PersonalLayout from '../../components/personal/PersonalLayout.jsx';

// 2단계에서 만들 화면 — 지금은 자리만 잡아둔다 (월 달력 + 오늘 날짜 작성 시트,
// 완료한 날짜엔 레드오커 색연필 X 표시).
export default function DiaryHome() {
  return (
    <PersonalLayout>
      <main className="page page--center">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 className="title">일기</h1>
          <p className="subtitle">다음 단계에서 만들어질 화면이에요.</p>
        </div>
      </main>
    </PersonalLayout>
  );
}
