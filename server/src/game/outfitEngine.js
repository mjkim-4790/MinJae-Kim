// '옷 입어보기'의 순수 로직 (DB·소켓 의존 없음).
//
// 게임이 아니라 쉬어가는 코너다. 점수도 판정도 없다 (운영 결정) — 눈으로 보고
// 어울리는지 그냥 느끼는 게 전부다.
//
// ── 사진이 유일하게 서버를 거치는 코너 ──────────────────────────────────────
// 다른 카메라 코너는 전부 "판정에 필요한 숫자만" 서버로 보낸다(색 hex, 관절 각도).
// 이 코너는 옷 사진 자체를 다른 화면(아이패드)에 띄워야 해서 이미지가 서버를
// 거칠 수밖에 없다. 대신 **서버 메모리에만** 두고 디스크에는 절대 쓰지 않는다.
// 참가자가 바뀌거나 코너가 끝나면 그 사람의 사진은 통째로 버려진다.

// 한 사람이 한 번에 올려둘 수 있는 옷 수. 무제한으로 두면 서버 메모리가
// 한 사람 때문에 계속 불어난다.
export const MAX_OUTFITS = 6;

// 옷 사진 하나의 최대 크기 (data URL 문자열 길이 기준).
// 폰이 800px 이하로 줄여 JPEG 로 보내면 대개 100~250KB 라 이 안에 넉넉히 들어온다.
// socket.io 기본 페이로드 한도(1MB)에 여유를 두려고 훨씬 작게 잡는다 — 이 한도는
// "폰이 시키는 대로 줄였는지"를 서버가 다시 확인하는 방어선이지, 정상 동작에서
// 걸릴 일은 없어야 한다.
export const MAX_IMAGE_CHARS = 700_000;

// 이보다 짧으면 사진이 아니라 깨진 값이다 (1x1 픽셀 같은 것도 거른다)
export const MIN_IMAGE_CHARS = 200;

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/;

/** 이 문자열이 올려도 되는 이미지인지. */
export function isValidImage(dataUrl) {
  if (typeof dataUrl !== 'string') return false;
  if (dataUrl.length < MIN_IMAGE_CHARS || dataUrl.length > MAX_IMAGE_CHARS) return false;
  return DATA_URL_RE.test(dataUrl);
}

/** 이 사람이 옷을 더 올릴 수 있는지. */
export function canAddMore(currentCount) {
  return currentCount < MAX_OUTFITS;
}
