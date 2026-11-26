const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function toDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function getStartOfWeek(dateStr) {
  const d = parseDateStr(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return toDateStr(d);
}

export function getWeekDates(anchorDateStr) {
  const start = getStartOfWeek(anchorDateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthGridDates(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1, 12, 0, 0);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startOffset, 12, 0, 0);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    days.push({
      dateStr: toDateStr(cur),
      dayNum: cur.getDate(),
      isCurrentMonth: cur.getMonth() === monthIndex
    });
  }
  return days;
}

export function formatDayShort(dateStr) {
  const d = parseDateStr(dateStr);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getWeekdayLabel(dateStr) {
  return WEEKDAYS_SHORT[parseDateStr(dateStr).getDay()];
}

export function getMonthName(monthIndex) {
  return MONTHS_PT[monthIndex];
}

export function getCurrentShiftId(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'night';
}

export function inferShiftFromTime(timeStr) {
  if (!timeStr) return 'morning';
  const hour = Number(timeStr.split(':')[0]);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'night';
}
