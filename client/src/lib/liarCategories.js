// 서버(server/src/game/liarWords.js)의 카테고리 목록과 id/이름을 맞춰서 들고 있는다
// (이 프로젝트는 클라이언트/서버가 별도 패키지라 공용 모듈을 두지 않고, rps.js 처럼
// 필요한 값만 각자 들고 있는 관례를 따른다). 실제 단어는 서버에만 있다 — 클라이언트는
// 카테고리 목록을 보여주는 용도로만 쓰고, 단어가 아직 없는 카테고리로 시작을 시도하면
// 서버가 CATEGORY_NOT_READY 로 거절한다.

export const MANUAL_CATEGORY_ID = 'manual';

export const CATEGORIES = [
  { id: 'food', name: '음식' },
  { id: 'animal', name: '동물' },
  { id: 'travel', name: '여행지 (국내/해외)' },
  { id: 'job', name: '직업' },
  { id: 'item', name: '생활용품/물건' },
  { id: 'sport', name: '스포츠/운동' },
  { id: 'hobby', name: '취미/여가활동' },
  { id: 'work', name: '회사/직장생활' },
  { id: MANUAL_CATEGORY_ID, name: '수동' },
];
