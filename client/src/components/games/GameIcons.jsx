// 게임 선택 그리드용 라인아트 아이콘 (오리지널 디자인).
// HandIcons.jsx 와 같은 톤: 흰 바탕 + 굵은 검정 선, 둥근 끝처리.

import LiarGameIcon from './LiarGameIcon.jsx';

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

function TypingIcon() {
  // 말풍선 안에 채팅 줄 + 오른쪽 아래로 튀어나가는 화살표(전송/빠르기)
  return (
    <>
      <path d="M14 22h60a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H46l-20 16V72h-4a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z" {...LINE} />
      <path d="M26 38h36M26 50h24" {...LINE} strokeWidth={6} />
      <path d="M62 78l20 10M82 88l-2-10M82 88l-10 3" {...LINE} strokeWidth={6} />
    </>
  );
}

function AcrosticIcon() {
  // 숫자 3 + 오른쪽에 세 줄의 글 — "세 글자로 세 줄을 짓는다"를 그대로 그린다
  return (
    <>
      <path
        d="M20 28 Q24 18 34 20 Q46 23 44 34 Q42 45 31 46 Q44 47 45 59 Q46 72 33 74 Q22 76 18 66"
        {...LINE}
        strokeWidth={7}
      />
      <path d="M58 30h30M58 50h26M58 70h32" {...LINE} strokeWidth={6} />
    </>
  );
}

function ValuesIcon() {
  // 여러 단어(작은 사각형들) 중 두 개는 취소선으로 지워지고, 하나만 굵은 테두리로
  // 남아 "여럿 중 끝까지 안 버린 것 하나"를 표현한다
  return (
    <>
      <rect x="10" y="14" width="24" height="20" rx="5" {...LINE} strokeWidth={5} opacity="0.45" />
      <path d="M13 24h18" stroke={STROKE} strokeWidth={5} strokeLinecap="round" opacity="0.45" />
      <rect x="38" y="14" width="24" height="20" rx="5" {...LINE} strokeWidth={5} opacity="0.45" />
      <path d="M41 24h18" stroke={STROKE} strokeWidth={5} strokeLinecap="round" opacity="0.45" />
      <rect x="66" y="14" width="24" height="20" rx="5" {...LINE} strokeWidth={5} opacity="0.45" />
      <path d="M69 24h18" stroke={STROKE} strokeWidth={5} strokeLinecap="round" opacity="0.45" />
      <rect x="30" y="56" width="40" height="30" rx="7" {...LINE} strokeWidth={7} />
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
  typing: TypingIcon,
  acrostic: AcrosticIcon,
  values: ValuesIcon,
};

// 자체 둥근 타일 배경을 이미 그려서 들고 있는 아이콘 — 그리드가 씌우는 기본 파란
// 배경 박스(.game-tile__icon)를 겹쳐 씌우지 않고 그대로 내보낸다.
export const SELF_CONTAINED_ICON_IDS = new Set(['liar']);

export function GameIcon({ id, size = 34, muted = false }) {
  // 가위바위보 이모지처럼 '준비중'이어도 무채색으로 죽이지 않고 원래 색을 그대로 보여준다
  if (id === 'liar') return <LiarGameIcon size={48} />;

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
