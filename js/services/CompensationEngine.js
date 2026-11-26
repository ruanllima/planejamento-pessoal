import {
  createCompensationLog,
  createEvent,
  EVENT_STATUS,
  SHIFT_ORDER,
  SHIFTS
} from '../domain/entities.js';
import { addDays, formatDayShort, getCurrentShiftId, getWeekDates, toDateStr } from '../domain/DateUtils.js';

export class CompensationEngine {
  constructor(repository) {
    this.repo = repository;
  }

  async getWeeklyQuotas(anchorDateStr) {
    const categories = await this.repo.getCategories();
    const events = await this.repo.getEvents();
    const weekDates = new Set(getWeekDates(anchorDateStr));

    return categories.map((cat) => {
      const catEvents = events.filter(
        (e) => e.category_id === cat.id && weekDates.has(e.date)
      );
      const completed = catEvents.filter((e) => e.status === EVENT_STATUS.DONE).length;
      const scheduled = catEvents.filter((e) => e.status !== EVENT_STATUS.FAILED).length;
      const failed = catEvents.filter((e) => e.status === EVENT_STATUS.FAILED).length;

      return {
        category: cat,
        completed,
        scheduled,
        failed,
        goal: cat.weekly_goal,
        deficit: cat.weekly_goal ? Math.max(0, cat.weekly_goal - scheduled) : 0
      };
    });
  }

  _buildCandidateSlots(failedEvent, allowNextWeek, now = new Date()) {
    const todayStr = toDateStr(now);
    const currentShiftIdx = SHIFT_ORDER.indexOf(getCurrentShiftId(now));

    const weekDates = getWeekDates(failedEvent.date);
    const horizonDates = [...weekDates];
    if (allowNextWeek) {
      const nextWeekStart = addDays(weekDates[6], 1);
      horizonDates.push(...getWeekDates(nextWeekStart));
    }

    const slots = [];
    for (const dateStr of horizonDates) {
      for (const shiftId of SHIFT_ORDER) {
        const shiftIdx = SHIFT_ORDER.indexOf(shiftId);

        if (dateStr < failedEvent.date) continue;
        if (dateStr === failedEvent.date && shiftIdx <= SHIFT_ORDER.indexOf(failedEvent.shift)) {
          continue;
        }
        if (dateStr < todayStr) continue;
        if (dateStr === todayStr && shiftIdx <= currentShiftIdx) continue;

        slots.push({ date: dateStr, shift: shiftId });
      }
    }
    return slots;
  }

  async findBestPlans(failedEvent, categoriesMap, allEvents, allowNextWeek = true) {
    const failedCat = categoriesMap.get(failedEvent.category_id);
    if (!failedCat) return [];

    const candidateSlots = this._buildCandidateSlots(failedEvent, allowNextWeek);
    const eventBySlot = new Map(
      allEvents
        .filter((e) => e.status !== EVENT_STATUS.FAILED)
        .map((e) => [`${e.date}::${e.shift}`, e])
    );

    const weekDatesSet = new Set(getWeekDates(failedEvent.date));
    const plans = [];

    for (const slot of candidateSlots) {
      if (!failedCat.allowed_shifts.includes(slot.shift)) continue;

      const isNextWeek = !weekDatesSet.has(slot.date);
      const weekPenalty = isNextWeek ? 50 : 0;
      const slotKey = `${slot.date}::${slot.shift}`;
      const occupant = eventBySlot.get(slotKey);

      if (!occupant) {
        plans.push({
          cost: 0 + weekPenalty,
          type: 'empty_slot',
          targetSlot: slot,
          displacedEvent: null,
          cascadeTargetSlot: null,
          cascadeSacrificedEvent: null,
          summary: `${failedCat.name} (${formatDayShort(failedEvent.date)} • ${SHIFTS[failedEvent.shift.toUpperCase()].label}) não realizado → Realocado para ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}) em horário livre.`
        });
        continue;
      }

      if (occupant.category_id === failedCat.id) continue;

      const priorityIdx = failedCat.substitution_priority.indexOf(occupant.category_id);
      if (priorityIdx === -1) continue;

      const occupantCat = categoriesMap.get(occupant.category_id);
      const directCost = (priorityIdx + 1) * 10 + weekPenalty;

      plans.push({
        cost: directCost,
        type: 'direct_replace',
        targetSlot: slot,
        displacedEvent: occupant,
        cascadeTargetSlot: null,
        cascadeSacrificedEvent: null,
        summary: `${failedCat.name} (${formatDayShort(failedEvent.date)} • ${SHIFTS[failedEvent.shift.toUpperCase()].label}) não realizado → Realocado para ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}) substituindo "${occupant.title}" (${priorityIdx + 1}ª opção de troca).`
      });

      if (occupantCat && occupantCat.is_compensable) {
        for (const secondarySlot of candidateSlots) {
          if (secondarySlot.date === slot.date && secondarySlot.shift === slot.shift) continue;
          if (!occupantCat.allowed_shifts.includes(secondarySlot.shift)) continue;

          const secKey = `${secondarySlot.date}::${secondarySlot.shift}`;
          const secOccupant = eventBySlot.get(secKey);

          if (!secOccupant) {
            const cascadeCost = (priorityIdx + 1) * 4 + weekPenalty;
            plans.push({
              cost: cascadeCost,
              type: 'cascade_to_empty',
              targetSlot: slot,
              displacedEvent: occupant,
              cascadeTargetSlot: secondarySlot,
              cascadeSacrificedEvent: null,
              summary: `Efeito Dominó: ${failedCat.name} assumiu ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}), e "${occupant.title}" foi preservado e movido para ${formatDayShort(secondarySlot.date)} (${SHIFTS[secondarySlot.shift.toUpperCase()].label}) (horário livre).`
            });
            break;
          } else if (secOccupant.category_id !== occupantCat.id && secOccupant.category_id !== failedCat.id) {
            const secPriorityIdx = occupantCat.substitution_priority.indexOf(secOccupant.category_id);
            if (secPriorityIdx !== -1) {
              const cascadeSacrificeCost = (priorityIdx + 1) * 6 + (secPriorityIdx + 1) * 8 + weekPenalty;
              plans.push({
                cost: cascadeSacrificeCost,
                type: 'cascade_replace',
                targetSlot: slot,
                displacedEvent: occupant,
                cascadeTargetSlot: secondarySlot,
                cascadeSacrificedEvent: secOccupant,
                summary: `Efeito Dominó: ${failedCat.name} assumiu ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}), deslocando "${occupant.title}" para ${formatDayShort(secondarySlot.date)} (${SHIFTS[secondarySlot.shift.toUpperCase()].label}) no lugar de "${secOccupant.title}".`
              });
              break;
            }
          }
        }
      }
    }

    return plans.sort((a, b) => a.cost - b.cost);
  }

  async markEventAsFailedAndCompensate(eventId) {
    const allEvents = await this.repo.getEvents();
    const targetEvent = allEvents.find((e) => e.id === eventId);
    if (!targetEvent) throw new Error('Evento não encontrado.');

    const categories = await this.repo.getCategories();
    const categoriesMap = new Map(categories.map((c) => [c.id, c]));
    const settings = await this.repo.getSettings();
    const failedCat = categoriesMap.get(targetEvent.category_id);

    const updatedFailedEvent = {
      ...targetEvent,
      status: EVENT_STATUS.FAILED,
      manual_status_override: true
    };
    await this.repo.saveEvent(updatedFailedEvent);

    if (!failedCat || !failedCat.is_compensable) {
      return { compensated: false, reason: 'Categoria configurada sem compensação automática.' };
    }

    const plans = await this.findBestPlans(
      updatedFailedEvent,
      categoriesMap,
      allEvents,
      settings.allow_next_week_spillover
    );

    if (plans.length === 0) {
      const log = createCompensationLog({
        failed_event_id: updatedFailedEvent.id,
        failed_category_id: failedCat.id,
        reason_human: `Falha registrada em "${updatedFailedEvent.title}" (${formatDayShort(updatedFailedEvent.date)}), mas não há turnos compatíveis disponíveis para compensação automática.`,
        snapshot_before: [targetEvent],
        status: 'pending_review'
      });
      await this.repo.saveCompensationLog(log);
      return { compensated: false, log };
    }

    const bestPlan = plans[0];
    return this._applyPlan(updatedFailedEvent, targetEvent, bestPlan);
  }

  async _applyPlan(updatedFailedEvent, originalFailedEventSnapshot, plan) {
    const snapshotBefore = [originalFailedEventSnapshot];
    const eventsToSave = [];
    const createdIds = [];
    const chainSteps = [];

    const logId = createCompensationLog({
      failed_event_id: updatedFailedEvent.id,
      failed_category_id: updatedFailedEvent.category_id,
      reason_human: plan.summary
    }).id;

    const compensatedEvent = createEvent({
      title: `${updatedFailedEvent.title} (Compensação)`,
      category_id: updatedFailedEvent.category_id,
      date: plan.targetSlot.date,
      shift: plan.targetSlot.shift,
      status: EVENT_STATUS.PENDING,
      compensation_log_id: logId
    });
    eventsToSave.push(compensatedEvent);
    createdIds.push(compensatedEvent.id);

    if (plan.displacedEvent) {
      snapshotBefore.push({ ...plan.displacedEvent });

      if (plan.type === 'direct_replace') {
        eventsToSave.push({
          ...plan.displacedEvent,
          status: EVENT_STATUS.FAILED,
          manual_status_override: true,
          notes: `Substituído por compensação de ${updatedFailedEvent.title}`
        });
        chainSteps.push(`Substituiu "${plan.displacedEvent.title}"`);
      } else if (plan.type === 'cascade_to_empty' || plan.type === 'cascade_replace') {
        eventsToSave.push({
          ...plan.displacedEvent,
          date: plan.cascadeTargetSlot.date,
          shift: plan.cascadeTargetSlot.shift,
          start_time: SHIFTS[plan.cascadeTargetSlot.shift.toUpperCase()].start,
          end_time: SHIFTS[plan.cascadeTargetSlot.shift.toUpperCase()].end,
          compensation_log_id: logId
        });
        chainSteps.push(
          `Moveu "${plan.displacedEvent.title}" para ${formatDayShort(plan.cascadeTargetSlot.date)}`
        );

        if (plan.cascadeSacrificedEvent) {
          snapshotBefore.push({ ...plan.cascadeSacrificedEvent });
          eventsToSave.push({
            ...plan.cascadeSacrificedEvent,
            status: EVENT_STATUS.FAILED,
            manual_status_override: true,
            notes: `Sacrificado em cadeia por ${plan.displacedEvent.title}`
          });
          chainSteps.push(`Sacrificou "${plan.cascadeSacrificedEvent.title}"`);
        }
      }
    }

    await this.repo.saveEventsBulk(eventsToSave);

    const log = createCompensationLog({
      id: logId,
      failed_event_id: updatedFailedEvent.id,
      failed_category_id: updatedFailedEvent.category_id,
      reason_human: plan.summary,
      chain_steps: chainSteps,
      snapshot_before: snapshotBefore,
      created_event_ids: createdIds,
      status: 'pending_review'
    });

    await this.repo.saveCompensationLog(log);
    return { compensated: true, log, alternatives: [] };
  }

  async rollbackCompensation(logId) {
    const logs = await this.repo.getCompensationLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log || log.status === 'reverted') return;

    for (const createdId of log.created_event_ids || []) {
      await this.repo.deleteEvent(createdId);
    }

    if (log.snapshot_before && log.snapshot_before.length > 0) {
      await this.repo.saveEventsBulk(log.snapshot_before);
    }

    await this.repo.saveCompensationLog({
      ...log,
      status: 'reverted'
    });
  }

  async confirmCompensation(logId) {
    const logs = await this.repo.getCompensationLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log) return;
    await this.repo.saveCompensationLog({
      ...log,
      status: 'confirmed'
    });
  }

  async getAlternativeSlotsForLog(logId) {
    const logs = await this.repo.getCompensationLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log) return [];

    const allEvents = await this.repo.getEvents();
    const failedEvent = allEvents.find((e) => e.id === log.failed_event_id);
    if (!failedEvent) return [];

    const categories = await this.repo.getCategories();
    const categoriesMap = new Map(categories.map((c) => [c.id, c]));
    const settings = await this.repo.getSettings();

    return this.findBestPlans(
      failedEvent,
      categoriesMap,
      allEvents,
      settings.allow_next_week_spillover
    );
  }

  async reallocateLogToPlan(logId, chosenPlan) {
    const logs = await this.repo.getCompensationLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log) return;

    for (const createdId of log.created_event_ids || []) {
      await this.repo.deleteEvent(createdId);
    }
    const othersToRestore = (log.snapshot_before || []).filter(
      (ev) => ev.id !== log.failed_event_id
    );
    if (othersToRestore.length > 0) {
      await this.repo.saveEventsBulk(othersToRestore);
    }

    const allEvents = await this.repo.getEvents();
    const failedEvent = allEvents.find((e) => e.id === log.failed_event_id);
    const originalSnapshot = (log.snapshot_before || []).find(
      (ev) => ev.id === log.failed_event_id
    ) || failedEvent;

    await this.repo.saveCompensationLog({ ...log, status: 'reverted' });
    return this._applyPlan(failedEvent, originalSnapshot, chosenPlan);
  }
}
