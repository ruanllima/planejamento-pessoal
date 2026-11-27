import { EVENT_STATUS, SHIFT_ORDER, SHIFTS } from './entities.js';

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = ISO_DATE_RE.exec(dateStr.trim());
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

export function sanitizeHexColor(color, fallback = '#3B82F6') {
  if (typeof color === 'string' && HEX_COLOR_RE.test(color.trim())) {
    return color.trim();
  }
  return fallback;
}

export function toDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateStr(dateStr) {
  if (!isValidDateStr(dateStr)) {
    throw new Error(`Data inválida: "${dateStr}"`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + Number(days || 0));
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

export function formatDayMonth(dateStr) {
  const d = parseDateStr(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getWeekdayFull(dateStr) {
  return WEEKDAYS_FULL[parseDateStr(dateStr).getDay()];
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

export function getEventStartDateTime(ev) {
  const [y, m, d] = ev.date.split('-').map(Number);
  const shiftMeta = Object.values(SHIFTS).find((s) => s.id === ev.shift) || SHIFTS.MORNING;
  const [hh, mm] = (ev.start_time || shiftMeta.start).split(':').map(Number);
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : shiftMeta.startHour, Number.isFinite(mm) ? mm : 0, 0, 0);
}

export function getEventEndDateTime(ev) {
  const [y, m, d] = ev.date.split('-').map(Number);
  const shiftMeta = Object.values(SHIFTS).find((s) => s.id === ev.shift) || SHIFTS.MORNING;
  if (ev.end_time && ev.end_time.includes(':')) {
    const [hh, mm] = ev.end_time.split(':').map(Number);
    return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 59, 59, 999);
  }
  return new Date(y, m - 1, d, shiftMeta.endHour, 0, 0, 0);
}

export function isEventInFuture(ev, now = new Date()) {
  return getEventStartDateTime(ev).getTime() > now.getTime();
}

export function hasEventEnded(ev, now = new Date()) {
  return getEventEndDateTime(ev).getTime() <= now.getTime();
}

export function isSlotOccupying(ev, now = new Date()) {
  if (!ev) return false;
  if (isEventInFuture(ev, now)) return true;
  return ev.status !== EVENT_STATUS.FAILED;
}

export function validateEventInput(ev, { categoryIds = null } = {}) {
  const errors = [];
  if (!ev || typeof ev !== 'object') {
    return { valid: false, errors: ['Evento inválido.'] };
  }
  if (!ev.title || typeof ev.title !== 'string' || !ev.title.trim()) {
    errors.push('Título do compromisso é obrigatório.');
  }
  if (!isValidDateStr(ev.date)) {
    errors.push('Data do compromisso inválida (esperado YYYY-MM-DD).');
  }
  if (!SHIFT_ORDER.includes(ev.shift)) {
    errors.push('Turno inválido.');
  }
  if (!Object.values(EVENT_STATUS).includes(ev.status)) {
    errors.push('Status do compromisso inválido.');
  }
  if (categoryIds && ev.category_id && !categoryIds.has(ev.category_id)) {
    errors.push('Categoria referenciada não existe.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCategoryInput(cat) {
  const errors = [];
  if (!cat || typeof cat !== 'object') {
    return { valid: false, errors: ['Categoria inválida.'] };
  }
  if (!cat.name || typeof cat.name !== 'string' || !cat.name.trim()) {
    errors.push('Nome da categoria é obrigatório.');
  }
  if (cat.weekly_goal !== null && cat.weekly_goal !== undefined) {
    const g = Number(cat.weekly_goal);
    if (!Number.isInteger(g) || g < 0 || g > 21) {
      errors.push('Meta semanal deve ser um inteiro entre 0 e 21.');
    }
  }
  if (!Array.isArray(cat.allowed_shifts) || cat.allowed_shifts.length === 0) {
    errors.push('Selecione ao menos um turno permitido.');
  } else if (cat.allowed_shifts.some((s) => !SHIFT_ORDER.includes(s))) {
    errors.push('Turno permitido inválido na categoria.');
  }
  return { valid: errors.length === 0, errors };
}
