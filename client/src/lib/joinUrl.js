// 참여 QR/링크에 넣을 주소를 만든다.
//
// 운영 배포에서는 브라우저 주소가 이미 공개 주소(https://...onrender.com)라 그대로 쓰면 된다.
// 문제는 로컬 개발인데, 운영자가 localhost:5173 으로 열어두면 QR 에도 localhost 가 박혀서
// 참여자 휴대폰이 그 QR 을 찍으면 "폰 자기 자신"에 접속하려다 실패한다.
// 그래서 개발 모드에서 주소가 localhost 인 경우에만, vite.config.js 가 주입해준
// 노트북 LAN 주소로 바꿔준다.

const DEV_LAN_ORIGIN = typeof __DEV_LAN_ORIGIN__ === 'string' ? __DEV_LAN_ORIGIN__ : null;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** QR/링크에 쓸 출처(origin). 로컬 개발이면 LAN 주소로 대체된다. */
export function publicOrigin() {
  const origin = window.location.origin;
  if (!DEV_LAN_ORIGIN) return origin;
  if (!LOCAL_HOSTNAMES.has(window.location.hostname)) return origin;
  return DEV_LAN_ORIGIN;
}

/** 참여자 입장 주소 (QR 에 담기는 값). */
export function joinUrlFor(code) {
  return `${publicOrigin()}/join/${code}`;
}

/** 지금 보고 있는 주소가 폰에서 열 수 없는 localhost 인지 (안내 문구 표시용). */
export function isLocalOnlyOrigin() {
  return LOCAL_HOSTNAMES.has(window.location.hostname);
}
