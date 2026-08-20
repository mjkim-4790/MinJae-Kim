// 취미 6개 카테고리 공용 메타데이터. hasLocation 이 있는 카테고리만 위치/영업시간
// 입력칸이 뜬다. 여행장소만 지도 연동이 있다(isTravel).
export const HOBBY_CATEGORIES = [
  { id: 'cafe', label: '카페', icon: '☕', hasLocation: true, isTravel: false, unit: '곳' },
  { id: 'restaurant', label: '식당', icon: '🍚', hasLocation: true, isTravel: false, unit: '곳' },
  { id: 'travel', label: '여행장소', icon: '🧳', hasLocation: true, isTravel: true, unit: '곳' },
  { id: 'book', label: '책', icon: '📖', hasLocation: false, isTravel: false, unit: '권' },
  { id: 'music', label: '음악', icon: '🎵', hasLocation: false, isTravel: false, unit: '곡' },
  { id: 'movie', label: '영화', icon: '🎬', hasLocation: false, isTravel: false, unit: '편' },
];

export function hobbyCategoryById(id) {
  return HOBBY_CATEGORIES.find((c) => c.id === id) ?? null;
}

// 여행장소 location 칸에 쓰는 17개 시/도 — lib/koreaMap.js 의 KOREA_REGIONS 와 이름이
// 일치해야 지도에 정확히 칠해진다.
export const SIDO_NAMES = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];
