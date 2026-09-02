// 운영자 화면의 게임 목록 (설계문서 §8 Phase 7+ 로드맵 기준).
// ready: false 인 게임은 그리드에 회색 "준비중" 으로만 보이고 선택할 수 없다.

export const GAMES = [
  { id: 'rps', name: '가위바위보', ready: true },
  { id: 'quiz4', name: '4지선다', ready: false },
  { id: 'ox', name: 'OX', ready: false },
  { id: 'lucky', name: '행운권 추첨', ready: false },
  { id: 'bingo', name: '빙고', ready: false },
  { id: 'initial', name: '초성 퀴즈', ready: false },
  { id: 'vote', name: '투표', ready: false },
  { id: 'survey', name: '설문', ready: false },
  { id: 'touch', name: '터치', ready: false },
  { id: 'liar', name: '라이어 게임', ready: true },
  { id: 'typing', name: '메시지 빨리 보내기', ready: true },
  { id: 'acrostic', name: '삼행시', ready: true },
  { id: 'values', name: '나의 가치여정', ready: true },
  { id: 'yabawi', name: '야바위 게임', ready: true },
  { id: 'wordcloud', name: '단어 구름', ready: true },
  { id: 'maze', name: '미로 찾기', ready: true },
  { id: 'chairs', name: '의자 빨리 뺏기', ready: true },
  { id: 'mugunghwa', name: '무궁화꽃이 피었습니다', ready: true },
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) ?? null;
}
