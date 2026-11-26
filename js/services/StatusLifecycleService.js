import { EVENT_STATUS, SHIFTS } from '../domain/entities.js';
import { isEventInFuture, toDateStr } from '../domain/DateUtils.js';

export class StatusLifecycleService {
  constructor(repository) {
    this.repo = repository;
  }

  async syncStatuses(now = new Date()) {
    const todayStr = toDateStr(now);
    const currentHour = now.getHours();
    const events = await this.repo.getEvents();
    const changed = [];

    for (const ev of events) {
      // Invariante rígido: compromisso futuro NUNCA pode estar como 'nao_realizado' (nem 'realizado' se ainda não iniciou)
      if (isEventInFuture(ev, now)) {
        if (ev.status === EVENT_STATUS.FAILED || ev.status === EVENT_STATUS.DONE) {
          changed.push({
            ...ev,
            status: EVENT_STATUS.PENDING,
            manual_status_override: false
          });
        }
        continue;
      }

      if (ev.status !== EVENT_STATUS.PENDING) continue;
      if (ev.manual_status_override) continue;

      const shiftMeta = Object.values(SHIFTS).find((s) => s.id === ev.shift) || SHIFTS.MORNING;
      const hasStarted =
        ev.date < todayStr || (ev.date === todayStr && currentHour >= shiftMeta.startHour);

      if (hasStarted) {
        changed.push({
          ...ev,
          status: EVENT_STATUS.DONE
        });
      }
    }

    if (changed.length > 0) {
      await this.repo.saveEventsBulk(changed);
    }
    return changed.length;
  }
}
