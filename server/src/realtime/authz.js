import { normalizeEventCode } from './rooms.js';

// session:hello 에서 로그인+소유권을 확인한 뒤 socket.data 에 남겨둔 플래그를 검사한다.
// (Phase 2부터 스크린 모드 전환/메시지 삭제 등 상태를 바꾸는 액션이 생겨 필요해졌다.)
export function isAuthorizedOperator(socket, eventCode) {
  return (
    Boolean(socket.data.isAuthenticatedOperator) &&
    socket.data.role === 'operator' &&
    socket.data.eventCode === normalizeEventCode(eventCode)
  );
}
