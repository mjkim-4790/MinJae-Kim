import { useId } from 'react';

/** 5개 중 별점 — 채워진 별은 크레용으로 칠한 듯 살짝 울퉁불퉁한 질감(feTurbulence)을 준다. */
export default function CrayonStars({ value = 0, onChange, readOnly = false }) {
  const filterId = useId();

  return (
    <div className="crayon-stars" role={readOnly ? undefined : 'radiogroup'} aria-label="별점">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" />
        </filter>
      </svg>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`crayon-star${n <= value ? ' crayon-star--filled' : ''}`}
          style={n <= value ? { filter: `url(#${filterId})` } : undefined}
          onClick={readOnly ? undefined : () => onChange(n === value ? 0 : n)}
          disabled={readOnly}
          aria-label={`${n}점`}
          aria-pressed={n <= value}
        >
          ★
        </button>
      ))}
    </div>
  );
}
