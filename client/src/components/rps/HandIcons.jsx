const STROKE = '#211f1c';
const FILL = '#ffffff';

const SHARED = {
  fill: FILL,
  stroke: STROKE,
  strokeWidth: 6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Wrist() {
  return <rect x="33" y="94" width="30" height="22" rx="6" {...SHARED} />;
}

function RockShape() {
  return (
    <>
      <Wrist />
      <rect x="20" y="46" width="60" height="54" rx="26" {...SHARED} />
      <rect x="10" y="58" width="20" height="26" rx="10" {...SHARED} />
      <path d="M38 50v10M50 48v12M62 50v10" fill="none" stroke={STROKE} strokeWidth={5} strokeLinecap="round" />
    </>
  );
}

function PaperShape() {
  return (
    <>
      <Wrist />
      <rect x="22" y="58" width="56" height="42" rx="18" {...SHARED} />
      <rect x="26" y="18" width="11" height="46" rx="5.5" {...SHARED} />
      <rect x="40" y="10" width="11" height="54" rx="5.5" {...SHARED} />
      <rect x="54" y="16" width="11" height="48" rx="5.5" {...SHARED} />
      <rect x="67" y="26" width="10" height="38" rx="5" {...SHARED} />
      <rect x="8" y="52" width="20" height="12" rx="6" transform="rotate(-35 18 58)" {...SHARED} />
    </>
  );
}

function ScissorsShape() {
  return (
    <>
      <Wrist />
      <rect x="22" y="58" width="56" height="42" rx="20" {...SHARED} />
      <rect x="10" y="64" width="18" height="20" rx="8" {...SHARED} />
      <rect x="30" y="16" width="12" height="52" rx="6" transform="rotate(-14 36 42)" {...SHARED} />
      <rect x="56" y="16" width="12" height="52" rx="6" transform="rotate(14 62 42)" {...SHARED} />
    </>
  );
}

const SHAPES = { rock: RockShape, paper: PaperShape, scissors: ScissorsShape };

/** 가위/바위/보 손 모양 라인아트 아이콘 (오리지널 디자인). */
export function HandIcon({ choice, size = 40, className }) {
  const Shape = SHAPES[choice];
  if (!Shape) return null;
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} className={className} aria-hidden="true">
      <Shape />
    </svg>
  );
}
