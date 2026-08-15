import { motion } from 'motion/react';

// 숫자 카운트다운과는 별개로 "지금 모래시계가 돌아가고 있다"를 감성적으로 보여주는
// 순수 장식용 루프 애니메이션 (오리지널 디자인, HandIcons.jsx 와 같은 라인아트 톤).
// MotionConfig(reducedMotion="user") 덕분에 동작 줄이기 설정에서는 자동으로 정지된 상태로 보인다.

const STROKE = '#211f1c';
const ACCENT = '#0a84ff';

const WAIST_Y = 70;
const TOP_Y = 20;
const BOTTOM_Y = 120;

const sandLoop = { duration: 1.6, repeat: Infinity, ease: 'easeInOut' };

export default function HourglassAnimation({ size = 64 }) {
  return (
    <svg
      viewBox="0 0 100 140"
      width={size}
      height={size * 1.4}
      aria-hidden="true"
      role="presentation"
    >
      {/* 위/아래 모래 — 각각 허리(waist) 지점을 기준으로 줄고 늘어난다 */}
      <motion.path
        d={`M30,${TOP_Y} L70,${TOP_Y} L50,${WAIST_Y} Z`}
        fill={ACCENT}
        style={{ transformOrigin: `50px ${WAIST_Y}px` }}
        animate={{ scaleY: [1, 0] }}
        transition={sandLoop}
      />
      <motion.path
        d={`M30,${BOTTOM_Y} L70,${BOTTOM_Y} L50,${WAIST_Y} Z`}
        fill={ACCENT}
        style={{ transformOrigin: `50px ${WAIST_Y}px` }}
        animate={{ scaleY: [0, 1] }}
        transition={sandLoop}
      />

      {/* 허리를 타고 떨어지는 모래 알갱이 */}
      {[0, 0.35, 0.7].map((delay) => (
        <motion.circle
          key={delay}
          cx={50}
          r={2.5}
          fill={ACCENT}
          initial={{ cy: WAIST_Y - 2, opacity: 0 }}
          animate={{ cy: WAIST_Y + 4, opacity: [0, 1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay, ease: 'linear' }}
        />
      ))}

      {/* 유리 테두리 (라인아트) */}
      <path
        d={`M30,${TOP_Y} L70,${TOP_Y} L50,${WAIST_Y} L70,${BOTTOM_Y} L30,${BOTTOM_Y} L50,${WAIST_Y} Z`}
        fill="none"
        stroke={STROKE}
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect x={20} y={TOP_Y - 8} width={60} height={10} rx={5} fill="#ffffff" stroke={STROKE} strokeWidth={6} />
      <rect x={20} y={BOTTOM_Y - 2} width={60} height={10} rx={5} fill="#ffffff" stroke={STROKE} strokeWidth={6} />
    </svg>
  );
}
