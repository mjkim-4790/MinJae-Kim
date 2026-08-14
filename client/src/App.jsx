import { Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';

import RequireOperator from './components/RequireOperator.jsx';
import Home from './routes/Home.jsx';
import OperatorEventDetail from './routes/operator/OperatorEventDetail.jsx';
import OperatorEvents from './routes/operator/OperatorEvents.jsx';
import OperatorLogin from './routes/operator/OperatorLogin.jsx';
import OperatorNewEvent from './routes/operator/OperatorNewEvent.jsx';
import PlayerJoin from './routes/player/PlayerJoin.jsx';
import ScreenView from './routes/screen/ScreenView.jsx';

// 설계문서 §3.1 — 하나의 앱에서 3화면을 라우팅으로 분리한다.
//   /operator/*      운영자 (MC 폰/노트북) — 로그인 필요 (§5.1)
//   /join/:code      참여자 (각자 스마트폰) — QR 스캔 시 이 주소로 바로 입장
//   /screen/:code    대형 스크린 (노트북+프로젝터) — 조작 없는 표시 전용
export default function App() {
  return (
    // reducedMotion="user" — OS의 "동작 줄이기" 설정을 motion/react 애니메이션 전체에 자동 반영.
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/operator/login" element={<OperatorLogin />} />
        <Route path="/operator" element={<RequireOperator />}>
          <Route index element={<OperatorEvents />} />
          <Route path="new" element={<OperatorNewEvent />} />
          <Route path="events/:id" element={<OperatorEventDetail />} />
        </Route>

        <Route path="/join/:code" element={<PlayerJoin />} />
        <Route path="/screen/:code" element={<ScreenView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MotionConfig>
  );
}
