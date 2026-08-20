// 일기 공용 값 — 날씨/마음 날씨 둘 다 같은 이모지 세트를 쓴다 (마음 날씨는
// 비유적으로: 맑음=좋음, 비=속상함 같은 식으로 이용자가 알아서 고른다).
export const WEATHER_OPTIONS = ['☀️', '⛅', '☁️', '🌧️', '⛈️', '❄️'];

/** Date → 'YYYY-MM-DD' (로컬 시간 기준, UTC 변환로 하루 밀리는 것을 피한다). */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** '8월 21일 금요일' 형식 */
export function formatKoreanDate(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_KO[date.getDay()]}요일`;
}
