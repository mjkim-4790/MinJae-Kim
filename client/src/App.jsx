import { Navigate, Route, Routes } from 'react-router-dom';

import Home from './routes/Home.jsx';
import OperatorHome from './routes/operator/OperatorHome.jsx';
import PlayerJoin from './routes/player/PlayerJoin.jsx';
import ScreenView from './routes/screen/ScreenView.jsx';

// 설계문서 §3.1 — 하나의 앱에서 3화면을 라우팅으로 분리한다.
//   /operator        운영자 (MC 폰/노트북)        · Phase 1 에서 로그인 추가
//   /join/:code      참여자 (각자 스마트폰)        · QR 스캔 시 이 주소로 바로 입장
//   /screen/:code    대형 스크린 (노트북+프로젝터) · 조작 없는 표시 전용
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/operator" element={<OperatorHome />} />
      <Route path="/join/:code" element={<PlayerJoin />} />
      <Route path="/screen/:code" element={<ScreenView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
