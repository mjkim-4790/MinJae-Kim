// 공용 스프링 프리셋 (/apple-design 스킬 §4 — damping/response 로 사고한다).
// 기본은 임계감쇠(오버슈트 없음), 모멘텀이 실린 순간(선택 확정·결과 리빌)에만 살짝 바운스.

export const springSettle = { type: 'spring', bounce: 0, duration: 0.35 };
export const springPop = { type: 'spring', bounce: 0.35, duration: 0.4 };
export const springTap = { type: 'spring', bounce: 0, duration: 0.15 };

// 리스트 재정렬(순위 변동) 전용 — 너무 통통 튀지 않게 낮은 bounce
export const springReorder = { type: 'spring', bounce: 0.15, duration: 0.5 };

// 화면 안에서 한 요소가 다른 자리로 옮겨가는(재배치) 전용 — /apple-design §4 표의
// "Move / reposition" 값(damping 1.0, response 0.4) 그대로. 오버슈트 없이 그 자리로
// 딱 이동한다 (예: '나의 가치여정'에서 마지막 남은 단어가 화면 중앙으로 이동).
export const springMove = { type: 'spring', bounce: 0, duration: 0.4 };

// 아래에서 올라오는 서랍/시트 전용 — Apple 이 "Drawer / sheet" 에 쓰는 값
// (damping 0.8, response 0.3). 손으로 민 것처럼 살짝의 바운스를 남긴다.
export const springDrawer = { type: 'spring', bounce: 0.2, duration: 0.3 };
