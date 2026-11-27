import { EVENT_STATUS } from '../domain/entities.js';
import { hasEventEnded, isEventInFuture } from '../domain/DateUtils.js';

export class StatusLifecycleService {
  constructor(repository) {
    this.repo = repository;
  }

  async syncStatuses(now = new Date()) {
    const events = await this.repo.getEvents();
    const changed = [];

    for (const ev of events) {
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

      if (hasEventEnded(ev, now)) {
        changed.push({
          ...ev,
          status: EVENT_STATUS.FAILED
        });
      }
    }

    if (changed.length > 0) {
      await this.repo.saveEventsBulk(changed);
    }
    return changed.length;
  }
}
