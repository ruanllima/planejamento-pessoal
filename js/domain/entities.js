/**
 * Entidades de Domínio desacopladas (Pronto para migração direta para Supabase / PostgreSQL).
 */

export const SHIFTS = Object.freeze({
  MORNING: { id: 'morning', label: 'Manhã', start: '06:00', end: '11:59', startHour: 6, endHour: 12 },
  AFTERNOON: { id: 'afternoon', label: 'Tarde', start: '12:00', end: '17:59', startHour: 12, endHour: 18 },
  NIGHT: { id: 'night', label: 'Noite', start: '18:00', end: '23:59', startHour: 18, endHour: 24 }
});

export const SHIFT_ORDER = ['morning', 'afternoon', 'night'];

export const EVENT_STATUS = Object.freeze({
  PENDING: 'pendente',
  DONE: 'realizado',
  FAILED: 'nao_realizado'
});

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowISO() {
  return new Date().toISOString();
}

export function createCategory({
  id = generateUUID(),
  name,
  color = '#3B82F6',
  weekly_goal = null,
  allowed_shifts = ['morning', 'afternoon', 'night'],
  substitution_priority = [],
  is_compensable = true,
  created_at = nowISO(),
  updated_at = nowISO()
}) {
  return {
    id,
    name: name.trim(),
    color,
    weekly_goal: weekly_goal !== null && weekly_goal !== '' ? Number(weekly_goal) : null,
    allowed_shifts: [...allowed_shifts],
    substitution_priority: [...substitution_priority],
    is_compensable: Boolean(is_compensable),
    created_at,
    updated_at
  };
}

export function createEvent({
  id = generateUUID(),
  title,
  category_id,
  date,
  shift,
  start_time = null,
  end_time = null,
  status = EVENT_STATUS.PENDING,
  manual_status_override = false,
  recurrence_id = null,
  compensation_log_id = null,
  notes = '',
  created_at = nowISO(),
  updated_at = nowISO()
}) {
  const shiftInfo = Object.values(SHIFTS).find((s) => s.id === shift) || SHIFTS.MORNING;
  return {
    id,
    title: title.trim(),
    category_id,
    date,
    shift: shiftInfo.id,
    start_time: start_time || shiftInfo.start,
    end_time: end_time || shiftInfo.end,
    status,
    manual_status_override: Boolean(manual_status_override),
    recurrence_id,
    compensation_log_id,
    notes,
    created_at,
    updated_at
  };
}

export function createRecurrence({
  id = generateUUID(),
  title,
  category_id,
  frequency = 'weekly',
  days_of_week = [],
  day_of_month = null,
  shifts = ['morning'],
  start_time = null,
  end_time = null,
  active = true,
  created_at = nowISO(),
  updated_at = nowISO()
}) {
  return {
    id,
    title: title.trim(),
    category_id,
    frequency,
    days_of_week: [...days_of_week],
    day_of_month: day_of_month ? Number(day_of_month) : null,
    shifts: [...shifts],
    start_time,
    end_time,
    active: Boolean(active),
    created_at,
    updated_at
  };
}

export function createCompensationLog({
  id = generateUUID(),
  failed_event_id,
  failed_category_id,
  reason_human,
  chain_steps = [],
  snapshot_before = [],
  created_event_ids = [],
  status = 'pending_review',
  created_at = nowISO(),
  updated_at = nowISO()
}) {
  return {
    id,
    failed_event_id,
    failed_category_id,
    reason_human,
    chain_steps,
    snapshot_before,
    created_event_ids,
    status,
    created_at,
    updated_at
  };
}
