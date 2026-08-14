// 공용 스프링 프리셋 (/apple-design 스킬 §4 — damping/response 로 사고한다).
// 기본은 임계감쇠(오버슈트 없음), 모멘텀이 실린 순간(선택 확정·결과 리빌)에만 살짝 바운스.

export const springSettle = { type: 'spring', bounce: 0, duration: 0.35 };
export const springPop = { type: 'spring', bounce: 0.35, duration: 0.4 };
export const springTap = { type: 'spring', bounce: 0, duration: 0.15 };

// 리스트 재정렬(순위 변동) 전용 — 너무 통통 튀지 않게 낮은 bounce
export const springReorder = { type: 'spring', bounce: 0.15, duration: 0.5 };
