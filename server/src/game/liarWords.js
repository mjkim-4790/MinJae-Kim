// 라이어 게임 카테고리별 제시어 목록 (설계문서 밖 — 운영자 요청 기반 신규 기능).
// words 는 아직 비어있다. 실제 단어 리스트를 받으면 여기 채워 넣는다 — 각 카테고리는
// words.length >= 2 여야 게임을 시작할 수 있다 (라이어용/시민용으로 서로 다른 두 단어를
// 뽑아야 하기 때문). '수동' 카테고리는 이 목록에 없다 — 진행자가 그때그때 직접 입력한다.

export const CATEGORIES = [
  { id: 'food', name: '음식', words: [] },
  { id: 'animal', name: '동물', words: [] },
  { id: 'travel', name: '여행지 (국내/해외)', words: [] },
  { id: 'job', name: '직업', words: [] },
  { id: 'item', name: '생활용품/물건', words: [] },
  { id: 'sport', name: '스포츠/운동', words: [] },
  { id: 'hobby', name: '취미/여가활동', words: [] },
  { id: 'work', name: '회사/직장생활', words: [] },
];

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}
