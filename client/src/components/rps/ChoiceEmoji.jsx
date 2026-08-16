import { CHOICE_META } from '../../lib/rps.js';

/** 가위/바위/보 유니코드 이모지 표시. 저작권 걱정 없이 기기마다 알아서 예쁘게 렌더링된다. */
export function ChoiceEmoji({ choice, size = 40, className }) {
  const meta = CHOICE_META[choice];
  if (!meta) return null;
  return (
    <span
      className={className}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}
      role="img"
      aria-label={meta.label}
    >
      {meta.emoji}
    </span>
  );
}
