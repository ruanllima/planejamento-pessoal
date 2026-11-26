import { createEvent, EVENT_STATUS } from '../domain/entities.js';
import { isEventInFuture, parseDateStr } from '../domain/DateUtils.js';

export class RecurrenceService {
  constructor(repository) {
    this.repo = repository;
  }

  /**
   * Saneia colisões históricas/futuras: garante estritamente no máximo 1 compromisso por turno (date::shift).
   * Em turnos futuros, preserva compromissos manuais/recorrentes originais e remove duplicatas excedentes.
   */
  async enforceSingleEventPerSlot() {
    const events = await this.repo.getEvents();
    if (events.length <= 1) return 0;

    const bySlot = new Map();
    for (const ev of events) {
      const key = `${ev.date}::${ev.shift}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(ev);
    }

    const idsToDelete = [];
    for (const [, slotEvents] of bySlot.entries()) {
      if (slotEvents.length <= 1) continue;

      // Prioridade de permanência no turno:
      // 1) Compromissos NÃO compensados (originais/recorrentes) têm prioridade sobre compensações duplicadas
      // 2) Se ambos forem da mesma natureza, mantém o mais antigo (created_at)
      const sorted = [...slotEvents].sort((a, b) => {
        const aComp = a.is_compensated || a.compensation_log_id ? 1 : 0;
        const bComp = b.is_compensated || b.compensation_log_id ? 1 : 0;
        if (aComp !== bComp) return aComp - bComp;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      // Para turnos futuros (ou múltiplos ativos no mesmo turno), mantém apenas 1
      const activeOrFuture = sorted.filter(
        (e) => isEventInFuture(e) || e.status !== EVENT_STATUS.FAILED
      );

      if (activeOrFuture.length > 1) {
        const keeper = activeOrFuture[0];
        for (const extra of activeOrFuture.slice(1)) {
          if (extra.id !== keeper.id) {
            idsToDelete.push(extra.id);
          }
        }
      }
    }

    for (const id of idsToDelete) {
      await this.repo.deleteEvent(id);
    }
    return idsToDelete.length;
  }

  async ensureEventsForRange(dateStrings) {
    await this.enforceSingleEventPerSlot();

    const recurrences = (await this.repo.getRecurrences()).filter((r) => r.active);
    if (recurrences.length === 0 || dateStrings.length === 0) return 0;

    const [events, suppressedList] = await Promise.all([
      this.repo.getEvents(),
      this.repo.getSuppressedRecurrences()
    ]);

    const suppressedSet = new Set(suppressedList);
    const existingKeys = new Set(
      events.map((e) => `${e.date}::${e.shift}::${e.recurrence_id || 'manual'}`)
    );
    const occupiedSlots = new Set(events.map((e) => `${e.date}::${e.shift}`));

    const toCreate = [];

    for (const dateStr of dateStrings) {
      const dateObj = parseDateStr(dateStr);
      const dow = dateObj.getDay();
      const dom = dateObj.getDate();

      for (const rec of recurrences) {
        const matches =
          (rec.frequency === 'weekly' && rec.days_of_week.includes(dow)) ||
          (rec.frequency === 'monthly' && rec.day_of_month === dom);

        if (!matches) continue;

        for (const shift of rec.shifts) {
          const recKey = `${dateStr}::${shift}::${rec.id}`;
          const slotKey = `${dateStr}::${shift}`;

          if (suppressedSet.has(recKey)) continue;
          if (existingKeys.has(recKey) || occupiedSlots.has(slotKey)) continue;

          const newEv = createEvent({
            title: rec.title,
            category_id: rec.category_id,
            date: dateStr,
            shift,
            start_time: rec.start_time,
            end_time: rec.end_time,
            status: EVENT_STATUS.PENDING,
            recurrence_id: rec.id
          });

          toCreate.push(newEv);
          existingKeys.add(recKey);
          occupiedSlots.add(slotKey);
        }
      }
    }

    if (toCreate.length > 0) {
      await this.repo.saveEventsBulk(toCreate);
    }
    return toCreate.length;
  }
}
