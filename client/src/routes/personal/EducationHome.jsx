import PersonalLayout from '../../components/personal/PersonalLayout.jsx';

// 4단계에서 만들 화면 — 초/중/고/대학생/자격증 카테고리, 학기별 성적·학점 입력.
export default function EducationHome() {
  return (
    <PersonalLayout>
      <main className="page page--center">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 className="title">교육</h1>
          <p className="subtitle">다음 단계에서 만들어질 화면이에요.</p>
        </div>
      </main>
    </PersonalLayout>
  );
}
