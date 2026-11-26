import { EVENT_STATUS, SHIFTS } from '../domain/entities.js';
import { toDateStr } from '../domain/DateUtils.js';

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
