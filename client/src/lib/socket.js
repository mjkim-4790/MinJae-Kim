import { io } from 'socket.io-client';

// 앱 전체가 소켓 하나를 공유한다.
// 개발 중에는 Vite 프록시(vite.config.js)가 /socket.io 를 4000 포트로 넘겨주므로
// 별도 주소 없이 같은 출처로 연결하면 된다.
export const socket = io({
  autoConnect: false,
  // 설계문서 §7-1 자동 재연결 — 끊겨도 계속 재시도한다.
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

if (import.meta.env.DEV) {
  window.__socket = socket; // 개발 중 콘솔에서 상태 확인용
}
