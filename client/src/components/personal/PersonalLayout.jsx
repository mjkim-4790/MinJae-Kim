import PersonalTabBar from './PersonalTabBar.jsx';

/** 일반인 전용 5개 상위 화면(홈/일기/취미/교육/게임)의 공통 뼈대 — 콘텐츠 위, 탭바 아래
 * 고정. 이벤트 상세처럼 한 단계 더 들어간 화면은 이 레이아웃을 쓰지 않고(§7 공간 일관성
 * — 들어간 만큼 되짚어 나오는 게 자연스럽다) 뒤로가기 링크로만 돌아온다. */
export default function PersonalLayout({ children }) {
  return (
    <div className="personal-shell">
      <div className="personal-shell__content">{children}</div>
      <PersonalTabBar />
    </div>
  );
}
