// 게임 선택 그리드용 라인아트 아이콘 (오리지널 디자인).
// HandIcons.jsx 와 같은 톤: 흰 바탕 + 굵은 검정 선, 둥근 끝처리.

const STROKE = 'currentColor';

const LINE = {
  fill: 'none',
  stroke: STROKE,
  strokeWidth: 6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Quiz4Icon() {
  // 2x2 보기 카드 + 정답 체크
  return (
    <>
      <rect x="10" y="12" width="34" height="26" rx="7" {...LINE} />
      <rect x="56" y="12" width="34" height="26" rx="7" {...LINE} />
      <rect x="10" y="50" width="34" height="26" rx="7" {...LINE} />
      <rect x="56" y="50" width="34" height="26" rx="7" {...LINE} />
      <path d="M64 63l6 6 12-13" {...LINE} strokeWidth={7} />
    </>
  );
}

function OxIcon() {
  return (
    <>
      <circle cx="30" cy="44" r="20" {...LINE} />
      <path d="M58 26l26 36M84 26 58 62" {...LINE} strokeWidth={7} />
    </>
  );
}

function LuckyIcon() {
  // 추첨함 + 뽑히는 티켓
  return (
    <>
      <path d="M16 44h68v34a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z" {...LINE} />
      <path d="M12 32h76v12H12z" {...LINE} />
      <path d="M50 32V14" {...LINE} strokeWidth={5} />
      <path d="M50 14c-6-8-18-6-16 2 2 6 16 -2 16 -2zM50 14c6-8 18-6 16 2-2 6-16-2-16-2z" {...LINE} strokeWidth={5} />
    </>
  );
}

function BingoIcon() {
  // 3x3 격자 + 대각선 빙고 줄
  return (
    <>
      <rect x="14" y="14" width="72" height="72" rx="8" {...LINE} />
      <path d="M38 14v72M62 14v72M14 38h72M14 62h72" {...LINE} strokeWidth={4} />
      <path d="M22 22 78 78" stroke={STROKE} strokeWidth={7} strokeLinecap="round" fill="none" opacity="0.45" />
    </>
  );
}

function InitialIcon() {
  // 말풍선 안의 초성 자음
  return (
    <>
      <path d="M16 20h68a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H44L26 82V66h-10a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" {...LINE} />
      <path d="M30 34h16M30 34v16" {...LINE} strokeWidth={6} />
      <path d="M58 34h16v16h-16z" {...LINE} strokeWidth={6} />
    </>
  );
}

function VoteIcon() {
  // 투표함에 넣는 용지
  return (
    <>
      <path d="M14 52h72v30a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" {...LINE} />
      <path d="M36 52V16h28v36" {...LINE} />
      <path d="M44 30h12M44 40h12" {...LINE} strokeWidth={5} />
      <path d="M40 52h20" {...LINE} strokeWidth={6} />
    </>
  );
}

function SurveyIcon() {
  // 클립보드 + 체크 항목
  return (
    <>
      <rect x="20" y="16" width="60" height="72" rx="8" {...LINE} />
      <rect x="38" y="8" width="24" height="16" rx="5" {...LINE} />
      <path d="M34 44l6 6 10-12M34 66l6 6 10-12" {...LINE} strokeWidth={5} />
      <path d="M58 44h14M58 66h14" {...LINE} strokeWidth={5} />
    </>
  );
}

function TouchIcon() {
  // 화면을 누르는 손가락 + 터치 파동
  return (
    <>
      <path d="M42 54V24a8 8 0 0 1 16 0v22" {...LINE} />
      <path d="M58 46a8 8 0 0 1 16 0v18a22 22 0 0 1-22 22h-4a18 18 0 0 1-14-7L24 66a8 8 0 0 1 12-10l6 7" {...LINE} />
      <path d="M22 20 14 12M78 20l8-8" {...LINE} strokeWidth={5} />
    </>
  );
}

// 게임 화면과 같은 이모지를 그대로 쓰는 게임은 SVG 대신 이모지로 보여준다
const EMOJI = {
  rps: '✌️',
};

const ICONS = {
  quiz4: Quiz4Icon,
  ox: OxIcon,
  lucky: LuckyIcon,
  bingo: BingoIcon,
  initial: InitialIcon,
  vote: VoteIcon,
  survey: SurveyIcon,
  touch: TouchIcon,
};

export function GameIcon({ id, size = 34 }) {
  const emoji = EMOJI[id];
  if (emoji) {
    return (
      <span style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }} aria-hidden="true">
        {emoji}
      </span>
    );
  }

  const Shape = ICONS[id];
  if (!Shape) return null;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <Shape />
    </svg>
  );
}
