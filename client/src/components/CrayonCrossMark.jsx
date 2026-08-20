import { useId } from 'react';
import { motion } from 'motion/react';

/**
 * 크레파스로 X 를 그은 질감 — 대각선 2개를 각각 굵고 흐린 "아래 겹" + 얇고 진한
 * "위 겹"으로 겹쳐서 밀랍 크레용 특유의 층진 느낌을 낸다. feTurbulence 로 선 자체를
 * 살짝 울퉁불퉁하게 왜곡해 손으로 눌러 그은 듯한 불규칙함을 더한다 (Friends 로고의
 * 크레파스 텍스처와 같은 방향의 질감. 나의 가치여정 게임과 일기 달력이 같이 쓴다).
 *
 * 색은 감싸는 요소의 CSS color 값을 그대로 따른다(stroke="currentColor" 방식) —
 * 쓰는 곳마다 부모에 color 만 다르게 주면 된다 (예: 나의 가치여정은 --bad,
 * 일기 달력은 --button-danger-bg/레드오커).
 */
export default function CrayonCrossMark() {
  const filterId = useId();

  return (
    <svg className="crayon-cross-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06 0.6" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <g filter={`url(#${filterId})`}>
        {[
          { d: 'M14 12 L86 88', delay: 0 },
          { d: 'M88 10 L10 84', delay: 0.14 },
        ].map(({ d, delay }) => (
          <g key={d}>
            <motion.path
              className="crayon-cross-mark__stroke crayon-cross-mark__stroke--under"
              d={d}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.22, delay, ease: 'easeOut' }}
            />
            <motion.path
              className="crayon-cross-mark__stroke crayon-cross-mark__stroke--core"
              d={d}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.22, delay: delay + 0.02, ease: 'easeOut' }}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
