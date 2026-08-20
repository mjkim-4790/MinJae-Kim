import { Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';

import RequireOperator from './components/RequireOperator.jsx';
import Home from './routes/Home.jsx';
import OperatorEventDetail from './routes/operator/OperatorEventDetail.jsx';
import OperatorEvents from './routes/operator/OperatorEvents.jsx';
import OperatorLogin from './routes/operator/OperatorLogin.jsx';
import OperatorNewEvent from './routes/operator/OperatorNewEvent.jsx';
import DiaryHome from './routes/personal/DiaryHome.jsx';
import EducationHome from './routes/personal/EducationHome.jsx';
import GameHome from './routes/personal/GameHome.jsx';
import HobbyCategory from './routes/personal/HobbyCategory.jsx';
import HobbyHome from './routes/personal/HobbyHome.jsx';
import PersonalHome from './routes/personal/PersonalHome.jsx';
import PlayerJoin from './routes/player/PlayerJoin.jsx';
import ScreenView from './routes/screen/ScreenView.jsx';
import Signup from './routes/Signup.jsx';

// 설계문서 §3.1 — 하나의 앱에서 3화면을 라우팅으로 분리한다.
//   /operator/*      MC 전용 (행사 진행) — 로그인 필요 (§5.1), 기존 구조 그대로
//   /home/*          일반인 전용 (일기·취미·교육·게임) — 로그인 필요, /home/game 은
//                     MC 전용과 완전히 같은 /operator/events/:id 화면을 재사용한다
//   /join:code       참여자 (각자 스마트폰) — QR 스캔 시 이 주소로 바로 입장
//   /screen/:code    대형 스크린 (노트북+프로젝터) — 조작 없는 표시 전용
//
// RequireOperator 는 이름과 달리 "로그인한 operators 테이블 계정인지" 만 확인한다 —
// MC/일반인 계정 구분은 accountType 값으로 화면 쪽에서만 갈라진다 (§9 결정).
export default function App() {
  return (
    // reducedMotion="user" — OS의 "동작 줄이기" 설정을 motion/react 애니메이션 전체에 자동 반영.
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/operator/login" element={<OperatorLogin />} />
        <Route path="/operator" element={<RequireOperator />}>
          <Route index element={<OperatorEvents />} />
          <Route path="new" element={<OperatorNewEvent />} />
          <Route path="events/:id" element={<OperatorEventDetail />} />
        </Route>

        <Route path="/home" element={<RequireOperator />}>
          <Route index element={<PersonalHome />} />
          <Route path="diary" element={<DiaryHome />} />
          <Route path="hobby" element={<HobbyHome />} />
          <Route path="hobby/:category" element={<HobbyCategory />} />
          <Route path="education" element={<EducationHome />} />
          <Route path="game" element={<GameHome />} />
        </Route>

        <Route path="/join/:code" element={<PlayerJoin />} />
        <Route path="/screen/:code" element={<ScreenView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MotionConfig>
  );
}
