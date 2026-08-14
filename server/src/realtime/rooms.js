// 룸 이름 규칙 (설계문서 §3.2 — 이벤트(방) 단위로 운영자/참여자/스크린이 같은 룸에 접속)
//
//   event:1234            → 이벤트 전체 (전원 브로드캐스트)
//   event:1234:operator   → 운영자 전용
//   event:1234:player     → 참여자 전용
//   event:1234:screen     → 대형 스크린 전용
//
// Phase 0 에서는 이벤트가 아직 없으므로 코드가 없으면 LOBBY 룸을 쓴다.

export const ROLES = ['operator', 'player', 'screen'];

export const LOBBY_CODE = 'LOBBY';

export function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'player';
}

export function normalizeEventCode(code) {
  const value = String(code ?? '').trim().toUpperCase();
  return value || LOBBY_CODE;
}

export function eventRoom(code) {
  return `event:${normalizeEventCode(code)}`;
}

export function roleRoom(code, role) {
  return `${eventRoom(code)}:${normalizeRole(role)}`;
}

export async function countInRoom(io, room) {
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}
