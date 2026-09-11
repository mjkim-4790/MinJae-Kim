// '퍼스널컬러 찾아보기'의 순수 로직 (DB·소켓 의존 없음).
//
// 게임이 아니라 쉬어가는 코너다. 맞고 틀리는 게 없고 점수도 없다 (운영 결정).
//
// ── 이건 진단이 아니다 ─────────────────────────────────────────────────────
// 전문 퍼스널컬러 진단은 통제된 조명과 실제 천을 쓴다. 행사장 조명 아래 아이패드
// 카메라로 읽은 피부톤은 조명 색온도에 크게 흔들린다. 그래서 카메라 값 하나로
// 정하지 않고, **본인이 직접 고른 드레이프 비교**를 주된 근거로 삼고 피부톤은
// 거들게만 했다. 사람이 "이게 더 나아 보인다"고 고른 건 조명이 바뀌어도 뒤집히지
// 않지만, 카메라가 읽은 색은 뒤집히기 때문이다.

/**
 * 드레이프 — 얼굴 옆에 대볼 두 색.
 * axis 는 이 비교가 무엇을 가리는지다: warm(웜/쿨), vivid(선명/차분).
 * a 를 고르면 그 축의 점수가 +1, b 면 0.
 */
export const DRAPES = [
  {
    id: 'metal', axis: 'warm', question: '어느 쪽 액세서리가 더 잘 어울리나요?',
    a: { label: '골드', color: '#d4a24c' },
    b: { label: '실버', color: '#c2c7cc' },
  },
  {
    id: 'lip', axis: 'warm', question: '어느 립 색이 얼굴을 살려주나요?',
    a: { label: '코랄', color: '#f0785a' },
    b: { label: '로즈', color: '#d2547e' },
  },
  {
    id: 'white', axis: 'warm', question: '어느 흰색이 더 깨끗해 보이나요?',
    a: { label: '아이보리', color: '#f5ecd9' },
    b: { label: '순백', color: '#f7f9fb' },
  },
  {
    id: 'deep', axis: 'warm', question: '어느 짙은 색이 더 어울리나요?',
    a: { label: '카멜', color: '#a9713a' },
    b: { label: '네이비', color: '#2b3a63' },
  },
  {
    id: 'clarity', axis: 'vivid', question: '어느 쪽이 더 생기 있어 보이나요?',
    a: { label: '선명한 색', color: '#e8442f' },
    b: { label: '차분한 색', color: '#b08a86' },
  },
];

export const WARM_DRAPES = DRAPES.filter((d) => d.axis === 'warm').length;

/**
 * 8유형 — 4계절을 밝기/선명도로 한 번 더 나눈 것 (운영 결정).
 *
 * 세 축으로 자른다: 웜/쿨 × 밝음/깊음 × 선명/부드러움.
 * 2×2×2 라 여덟 칸이 정확히 채워지고, "왜 이 유형인지"를 세 문장으로 설명할 수 있다.
 */
export const TYPES = [
  {
    id: 'spring-bright', name: '봄 브라이트', warm: true, light: true, vivid: true,
    desc: '맑고 선명한 색이 얼굴을 밝혀줍니다',
    palette: ['#ff6f3c', '#ffd23f', '#3ec1a8', '#ff8fab', '#f9f4e3'],
    avoid: '탁하고 어두운 색',
  },
  {
    id: 'spring-light', name: '봄 라이트', warm: true, light: true, vivid: false,
    desc: '부드럽고 따뜻한 파스텔이 잘 맞습니다',
    palette: ['#ffb38a', '#ffe0a3', '#b8e0c2', '#ffc9d4', '#fdf6ec'],
    avoid: '차갑고 진한 색',
  },
  {
    id: 'autumn-mute', name: '가을 뮤트', warm: true, light: false, vivid: false,
    desc: '흙빛이 도는 차분한 색이 편안합니다',
    palette: ['#b5763f', '#8f9b6a', '#c2916b', '#7d5a4f', '#efe3d0'],
    avoid: '쨍한 형광빛',
  },
  {
    id: 'autumn-deep', name: '가을 딥', warm: true, light: false, vivid: true,
    desc: '깊고 진한 따뜻한 색이 무게를 실어줍니다',
    palette: ['#8c3a1e', '#6b5320', '#3f5540', '#7a2f3a', '#e6d5b8'],
    avoid: '연하고 흐린 색',
  },
  {
    id: 'summer-light', name: '여름 라이트', warm: false, light: true, vivid: false,
    desc: '맑고 서늘한 파스텔이 잘 어울립니다',
    palette: ['#a8c7e8', '#d5bde0', '#f2b8c6', '#bfe3dd', '#f6f7fb'],
    avoid: '노란기 도는 진한 색',
  },
  {
    id: 'summer-mute', name: '여름 뮤트', warm: false, light: false, vivid: false,
    desc: '회색이 섞인 부드러운 색이 차분하게 맞습니다',
    palette: ['#8e9bb0', '#a98ba3', '#9fb8ae', '#c7a9a4', '#eceff3'],
    avoid: '쨍하고 노란 색',
  },
  {
    id: 'winter-bright', name: '겨울 브라이트', warm: false, light: true, vivid: true,
    desc: '또렷하고 선명한 색이 시원하게 받쳐줍니다',
    palette: ['#0f5fd4', '#e0184a', '#00a58e', '#f2f4f8', '#1b1d21'],
    avoid: '흐릿하고 탁한 색',
  },
  {
    id: 'winter-deep', name: '겨울 딥', warm: false, light: false, vivid: true,
    desc: '짙고 차가운 색이 또렷하게 어울립니다',
    palette: ['#1c2b52', '#5c1435', '#12463c', '#2b2b2e', '#f0f2f6'],
    avoid: '노란기 도는 연한 색',
  },
];

export function typeById(id) {
  return TYPES.find((t) => t.id === id) ?? null;
}

// 피부톤에서 읽는 값의 경계.
// 카메라가 조명에 흔들리므로 넓게 잡고, 애매하면 드레이프 답에 맡긴다.
export const SKIN_WARM_HUE = 65; // OKLCh 색상각이 이보다 작으면 붉은/쿨 쪽, 크면 노란/웜 쪽
export const SKIN_LIGHT_L = 0.72; // 이보다 밝으면 '밝음'

/**
 * 드레이프 답과 피부톤으로 8유형 중 하나를 고른다.
 *
 * @param {Record<string,'a'|'b'>} answers 드레이프 id -> 고른 쪽
 * @param {{L:number,C:number,H:number}|null} skin 카메라가 읽은 피부톤 (없어도 된다)
 * @returns {{ type: object, warmScore: number, reason: string[] }}
 */
export function classify(answers, skin) {
  const picked = (id) => answers?.[id] ?? null;

  // ── 웜/쿨 ── 드레이프 네 개가 주된 근거
  let warmVotes = 0;
  let warmAnswered = 0;
  for (const d of DRAPES) {
    if (d.axis !== 'warm') continue;
    const p = picked(d.id);
    if (!p) continue;
    warmAnswered += 1;
    if (p === 'a') warmVotes += 1;
  }
  // 피부톤은 한 표만 준다 — 조명에 흔들리는 값에 결과를 맡기지 않는다
  let skinWarmVote = null;
  if (skin && Number.isFinite(skin.H)) skinWarmVote = skin.H >= SKIN_WARM_HUE;
  const totalVotes = warmAnswered + (skinWarmVote == null ? 0 : 1);
  const warmSum = warmVotes + (skinWarmVote ? 1 : 0);
  // 반반이면 드레이프 쪽으로 기운다 (본인이 고른 것이 더 믿을 만하다)
  const warm = totalVotes === 0 ? true : warmSum * 2 > totalVotes
    || (warmSum * 2 === totalVotes && warmVotes * 2 >= warmAnswered);

  // ── 선명/부드러움 ── 드레이프 하나로 정한다
  const vivid = picked('clarity') === 'a';

  // ── 밝음/깊음 ── 피부 밝기. 못 읽었으면 밝은 쪽으로 둔다 (행사 사진은 대체로 밝다)
  const light = skin && Number.isFinite(skin.L) ? skin.L >= SKIN_LIGHT_L : true;

  const type = TYPES.find((t) => t.warm === warm && t.light === light && t.vivid === vivid)
    // 여덟 칸이 다 차 있어 여기 올 일은 없지만, 팔레트를 고치다 빈칸이 생겨도
    // 화면이 깨지지 않게 기본값을 둔다
    ?? TYPES[0];

  const reason = [
    `${warm ? '따뜻한' : '서늘한'} 쪽 (${warmVotes}/${warmAnswered} 선택${skinWarmVote == null ? '' : `, 피부톤 ${skinWarmVote ? '노란기' : '붉은기'}`})`,
    `${light ? '밝은' : '깊은'} 톤${skin ? '' : ' (피부톤을 못 읽어 기본값)'}`,
    `${vivid ? '선명한' : '부드러운'} 색`,
  ];

  return { type, warmScore: warmVotes, reason };
}
