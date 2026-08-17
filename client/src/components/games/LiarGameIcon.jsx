/**
 * 라이어 게임 아이콘 (가면 · 타일)
 *
 * 사용 예:
 *   <LiarGameIcon />                       // 기본 (보라)
 *   <LiarGameIcon size={44} />             // 크기 지정
 *   <LiarGameIcon tile="#332A55" mask="#8B7BFF" cut="#332A55" />  // 다크 배경용
 *
 * props
 *   size : 픽셀 크기 (기본 48)
 *   tile : 둥근 사각형 배경색
 *   mask : 가면 색
 *   cut  : 눈 부분 색 — 보통 tile과 같은 값으로 두면 뚫린 것처럼 보입니다
 */
export default function LiarGameIcon({
  size = 48,
  tile = '#EFEBFF',
  mask = '#5B46E8',
  cut = '#EFEBFF',
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="라이어 게임"
      {...props}
    >
      <rect x="6" y="6" width="108" height="108" rx="28" fill={tile} />
      <path
        d="M26 42 q34 -9 68 0 q4 27 -11 42 q-9 9 -23 9 q-14 0 -23 -9 q-15 -15 -11 -42 z"
        fill={mask}
      />
      <path d="M38 57 q9 -7 19 0 q-9 7 -19 0 z" fill={cut} />
      <path d="M63 57 q9 -7 19 0 q-9 7 -19 0 z" fill={cut} />
    </svg>
  );
}
