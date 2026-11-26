import { createEvent, EVENT_STATUS } from '../domain/entities.js';
import { parseDateStr } from '../domain/DateUtils.js';

export class RecurrenceService {
  constructor(repository) {
    this.repo = repository;
  }

  async ensureEventsForRange(dateStrings) {
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
