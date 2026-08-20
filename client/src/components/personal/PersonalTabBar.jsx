import { NavLink } from 'react-router-dom';

// 하단 탭 5자리 — 4대 카테고리를 탭바에 직접 배치하고, 가운데 동그란 버튼은 "홈"
// (가족 일정 달력)을 맡는다 (사용자 결정 — 처음엔 홈/히스토리/+/카테고리였다가,
// 카테고리 4개를 탭바 자리에 직접 넣고 가운데 동그란 버튼은 유지하는 걸로 변경).

function DiaryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

function HobbyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s-7-4.4-9.3-8.8C1 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3 2.2-2 3.5-3 5.5-3C21 5 23 8.4 21.3 12.2 19 16.6 12 21 12 21z" />
    </svg>
  );
}

function EduIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 8l10-4 10 4-10 4-10-4z" />
      <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" />
    </svg>
  );
}

function GameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="11" rx="4" />
      <path d="M7 11v4M5 13h4M15.5 12h.01M18.5 14h.01" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
      <path d="M3 11l9-7 9 7M5 10v10h14V10" />
    </svg>
  );
}

function TabLink({ to, icon, label }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `tab-item${isActive ? ' tab-item--active' : ''}`}>
      {icon}
      {label}
    </NavLink>
  );
}

export default function PersonalTabBar() {
  return (
    <nav className="tabbar" aria-label="주요 카테고리">
      <TabLink to="/home/diary" icon={<DiaryIcon />} label="일기" />
      <TabLink to="/home/hobby" icon={<HobbyIcon />} label="취미" />
      <NavLink
        to="/home"
        end
        className={({ isActive }) => `tab-home${isActive ? ' tab-home--active' : ''}`}
        aria-label="홈"
      >
        <HomeIcon />
      </NavLink>
      <TabLink to="/home/education" icon={<EduIcon />} label="교육" />
      <TabLink to="/home/game" icon={<GameIcon />} label="게임" />
    </nav>
  );
}
