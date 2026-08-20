import PersonalLayout from '../../components/personal/PersonalLayout.jsx';

// 3단계에서 만들 화면 — 카페·식당·여행장소·책·음악·영화, 오른쪽 슬라이드 입력 패널,
// 여행장소는 대한민국 지도 포함.
export default function HobbyHome() {
  return (
    <PersonalLayout>
      <main className="page page--center">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 className="title">취미</h1>
          <p className="subtitle">다음 단계에서 만들어질 화면이에요.</p>
        </div>
      </main>
    </PersonalLayout>
  );
}
