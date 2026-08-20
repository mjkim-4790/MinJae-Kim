// 월 달력 그리드 계산 — 일요일 시작, 앞뒤 빈 칸 포함.

/** @returns {Array<{ date: number|null }>} 해당 월의 1일부터 말일까지, 앞뒤는 null 로 채운 7의 배수 배열 */
export function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=일 ... 6=토
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ date: d });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  return cells;
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
