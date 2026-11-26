import {
  createCompensationLog,
  createEvent,
  EVENT_STATUS,
  SHIFT_ORDER,
  SHIFTS
} from '../domain/entities.js';
import { addDays, formatDayShort, getCurrentShiftId, getWeekDates, isEventInFuture, toDateStr } from '../domain/DateUtils.js';

export class CompensationEngine {
  constructor(repository) {
    this.repo = repository;
  }

  async getWeeklyQuotas(anchorDateStr) {
    const categories = await this.repo.getCategories();
    const events = await this.repo.getEvents();
    const weekDates = new Set(getWeekDates(anchorDateStr));

    return categories
      .filter((cat) => cat.weekly_goal !== null && Number(cat.weekly_goal) > 0)
      .map((cat) => {
        const goal = Number(cat.weekly_goal);
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
          goal,
          deficit: Math.max(0, goal - scheduled)
        };
      });
  }

  _buildCandidateSlots(referenceDateStr, referenceShiftId, allowNextWeek, now = new Date()) {
    const todayStr = toDateStr(now);
    const currentShiftIdx = SHIFT_ORDER.indexOf(getCurrentShiftId(now));

    const weekDates = getWeekDates(referenceDateStr);
    const horizonDates = [...weekDates];
    if (allowNextWeek) {
      const nextWeekStart = addDays(weekDates[6], 1);
      horizonDates.push(...getWeekDates(nextWeekStart));
    }

    const slots = [];
    for (const dateStr of horizonDates) {
      for (const shiftId of SHIFT_ORDER) {
        const shiftIdx = SHIFT_ORDER.indexOf(shiftId);

        if (dateStr < referenceDateStr) continue;
        if (dateStr === referenceDateStr && shiftIdx <= SHIFT_ORDER.indexOf(referenceShiftId)) {
          continue;
        }
        if (dateStr < todayStr) continue;
        if (dateStr === todayStr && shiftIdx <= currentShiftIdx) continue;

        slots.push({ date: dateStr, shift: shiftId });
      }
    }
    return slots;
  }

  _buildSearchTargetsForCategory(targetCat, orderedCategories) {
    const targets = [{ type: 'none', category: null }];
    const globalList = orderedCategories.filter((c) => Boolean(c.in_global_list));
    const targetIndexInGlobal = globalList.findIndex((c) => c.id === targetCat.id);

    for (let i = 0; i < globalList.length; i++) {
      if (targetIndexInGlobal !== -1 && i >= targetIndexInGlobal) {
        break;
      }
      const cat = globalList[i];
      if (cat.id === targetCat.id) continue;
      targets.push({ type: 'category', category: cat });
    }

    return targets;
  }

  async findBestPlans(sourceEvent, orderedCategories, allEvents, allowNextWeek = true) {
    const sourceCat = orderedCategories.find((c) => c.id === sourceEvent.category_id);
    if (!sourceCat || !sourceCat.is_relocatable) {
      return [];
    }

    const candidateSlots = this._buildCandidateSlots(
      sourceEvent.date,
      sourceEvent.shift,
      allowNextWeek
    );

    const eventBySlot = new Map();
    for (const ev of allEvents) {
      if (ev.status === EVENT_STATUS.FAILED) continue;
      const key = `${ev.date}::${ev.shift}`;
      if (!eventBySlot.has(key)) {
        eventBySlot.set(key, ev);
      }
    }

    const searchTargets = this._buildSearchTargetsForCategory(sourceCat, orderedCategories);
    const plans = [];

    for (let tIdx = 0; tIdx < searchTargets.length; tIdx++) {
      const target = searchTargets[tIdx];

      for (const slot of candidateSlots) {
        if (!sourceCat.allowed_shifts.includes(slot.shift)) continue;

        const occupant = eventBySlot.get(`${slot.date}::${slot.shift}`);

        if (target.type === 'none') {
          if (!occupant) {
            plans.push({
              cost: plans.length,
              type: 'empty_slot',
              targetSlot: slot,
              displacedEvent: null,
              cascadeTargetSlot: null,
              cascadeSacrificedEvent: null,
              summary: `${sourceCat.name} (${formatDayShort(sourceEvent.date)}, ${SHIFTS[sourceEvent.shift.toUpperCase()].label}) realocado para ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}) em turno livre.`
            });
          }
        } else if (target.type === 'category' && occupant) {
          if (occupant.category_id !== target.category.id) continue;
          if (occupant.category_id === sourceCat.id) continue;

          const occupantCat = target.category;

          if (occupantCat.is_relocatable) {
            const subTargets = this._buildSearchTargetsForCategory(occupantCat, orderedCategories);
            let chained = false;

            for (const subTarget of subTargets) {
              for (const secSlot of candidateSlots) {
                if (secSlot.date === slot.date && secSlot.shift === slot.shift) continue;
                if (!occupantCat.allowed_shifts.includes(secSlot.shift)) continue;

                const secOccupant = eventBySlot.get(`${secSlot.date}::${secSlot.shift}`);

                if (subTarget.type === 'none' && !secOccupant) {
                  plans.push({
                    cost: plans.length,
                    type: 'cascade_to_empty',
                    targetSlot: slot,
                    displacedEvent: occupant,
                    cascadeTargetSlot: secSlot,
                    cascadeSacrificedEvent: null,
                    summary: `Efeito Dominó: ${sourceCat.name} assumiu ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}), e "${occupant.title}" foi realocado para ${formatDayShort(secSlot.date)} (${SHIFTS[secSlot.shift.toUpperCase()].label}).`
                  });
                  chained = true;
                  break;
                } else if (
                  subTarget.type === 'category' &&
                  secOccupant &&
                  secOccupant.category_id === subTarget.category.id &&
                  secOccupant.category_id !== occupantCat.id &&
                  secOccupant.category_id !== sourceCat.id
                ) {
                  plans.push({
                    cost: plans.length,
                    type: 'cascade_replace',
                    targetSlot: slot,
                    displacedEvent: occupant,
                    cascadeTargetSlot: secSlot,
                    cascadeSacrificedEvent: secOccupant,
                    summary: `Efeito Dominó: ${sourceCat.name} assumiu ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}), deslocando "${occupant.title}" para ${formatDayShort(secSlot.date)} (${SHIFTS[secSlot.shift.toUpperCase()].label}) no lugar de "${secOccupant.title}".`
                  });
                  chained = true;
                  break;
                }
              }
              if (chained) break;
            }

            if (!chained) {
              plans.push({
                cost: plans.length,
                type: 'direct_replace',
                targetSlot: slot,
                displacedEvent: occupant,
                cascadeTargetSlot: null,
                cascadeSacrificedEvent: null,
                summary: `${sourceCat.name} (${formatDayShort(sourceEvent.date)}, ${SHIFTS[sourceEvent.shift.toUpperCase()].label}) realocado para ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}) substituindo "${occupant.title}".`
              });
            }
          } else {
            plans.push({
              cost: plans.length,
              type: 'direct_replace',
              targetSlot: slot,
              displacedEvent: occupant,
              cascadeTargetSlot: null,
              cascadeSacrificedEvent: null,
              summary: `${sourceCat.name} (${formatDayShort(sourceEvent.date)}, ${SHIFTS[sourceEvent.shift.toUpperCase()].label}) realocado para ${formatDayShort(slot.date)} (${SHIFTS[slot.shift.toUpperCase()].label}) substituindo "${occupant.title}".`
            });
          }
        }
      }
    }

    return plans;
  }

  async handleManualDisplacement(displacedEvent, replacingEvent) {
    const orderedCategories = await this.repo.getCategories();
    const displacedCat = orderedCategories.find((c) => c.id === displacedEvent.category_id);

    if (!displacedCat || !displacedCat.is_relocatable) {
      return { compensated: false, reason: 'Categoria deslocada não é realocável automaticamente.' };
    }

    const settings = await this.repo.getSettings();
    const allEvents = await this.repo.getEvents();

    const plans = await this.findBestPlans(
      displacedEvent,
      orderedCategories,
      allEvents,
      settings.allow_next_week_spillover
    );

    const reasonPrefix = `"${replacingEvent.title}" ocupou ${formatDayShort(displacedEvent.date)} (${SHIFTS[displacedEvent.shift.toUpperCase()].label}) e deslocou "${displacedEvent.title}".`;

    if (plans.length === 0) {
      const log = createCompensationLog({
        failed_event_id: displacedEvent.id,
        failed_category_id: displacedCat.id,
        reason_human: `${reasonPrefix} Nenhum turno compatível inferior disponível — meta ficou com déficit.`,
        snapshot_before: [displacedEvent],
        status: 'pending_review'
      });
      await this.repo.saveCompensationLog(log);
      return { compensated: false, log };
    }

    const bestPlan = {
      ...plans[0],
      summary: `${reasonPrefix} ${plans[0].summary}`
    };

    return this._applyPlan(displacedEvent, displacedEvent, bestPlan, { markSourceAsFailed: false });
  }

  async toggleEventCompletionState(eventId) {
    const allEvents = await this.repo.getEvents();
    const targetEvent = allEvents.find((e) => e.id === eventId);
    if (!targetEvent) throw new Error('Evento não encontrado.');

    if (isEventInFuture(targetEvent)) {
      return { state: 'blocked_future', compensated: false };
    }

    if (targetEvent.status === EVENT_STATUS.FAILED) {
      const logs = await this.repo.getCompensationLogs();
      const activeLog = logs.find(
        (l) => l.failed_event_id === eventId && l.status !== 'reverted'
      );

      if (activeLog) {
        await this.rollbackCompensation(activeLog.id);
      }

      const freshEvents = await this.repo.getEvents();
      const freshTarget = freshEvents.find((e) => e.id === eventId) || targetEvent;

      await this.repo.saveEvent({
        ...freshTarget,
        status: EVENT_STATUS.DONE,
        manual_status_override: true
      });

      return { state: 'done', compensated: false };
    }

    const res = await this.markEventAsFailedAndCompensate(eventId);
    return { state: 'failed', ...res };
  }

  async markEventAsFailedAndCompensate(eventId) {
    const allEvents = await this.repo.getEvents();
    const targetEvent = allEvents.find((e) => e.id === eventId);
    if (!targetEvent) throw new Error('Evento não encontrado.');

    if (isEventInFuture(targetEvent)) {
      return { compensated: false, reason: 'Compromissos futuros não podem ser marcados como não realizados.' };
    }

    const orderedCategories = await this.repo.getCategories();
    const settings = await this.repo.getSettings();
    const failedCat = orderedCategories.find((c) => c.id === targetEvent.category_id);

    const updatedFailedEvent = {
      ...targetEvent,
      status: EVENT_STATUS.FAILED,
      manual_status_override: true
    };
    await this.repo.saveEvent(updatedFailedEvent);

    if (!failedCat || !failedCat.is_relocatable) {
      return { compensated: false, reason: 'Categoria não realocável automaticamente.' };
    }

    const existingLogs = await this.repo.getCompensationLogs();
    const alreadyCompensated = existingLogs.find(
      (l) => l.failed_event_id === eventId && l.status !== 'reverted'
    );
    if (alreadyCompensated) {
      return { compensated: false, log: alreadyCompensated };
    }

    const refreshedEvents = await this.repo.getEvents();
    const plans = await this.findBestPlans(
      updatedFailedEvent,
      orderedCategories,
      refreshedEvents,
      settings.allow_next_week_spillover
    );

    if (plans.length === 0) {
      const log = createCompensationLog({
        failed_event_id: updatedFailedEvent.id,
        failed_category_id: failedCat.id,
        reason_human: `Falha registrada em "${updatedFailedEvent.title}" (${formatDayShort(updatedFailedEvent.date)}), sem turnos compatíveis disponíveis.`,
        snapshot_before: [targetEvent],
        status: 'pending_review'
      });
      await this.repo.saveCompensationLog(log);
      return { compensated: false, log };
    }

    const bestPlan = plans[0];
    return this._applyPlan(updatedFailedEvent, targetEvent, bestPlan, { markSourceAsFailed: true });
  }

  async _applyPlan(sourceEvent, originalSnapshot, plan, { markSourceAsFailed = true } = {}) {
    const snapshotBefore = markSourceAsFailed ? [originalSnapshot] : [];
    const eventsToSave = [];
    const createdIds = [];
    const chainSteps = [];

    const logId = createCompensationLog({
      failed_event_id: sourceEvent.id,
      failed_category_id: sourceEvent.category_id,
      reason_human: plan.summary
    }).id;

    const currentEvents = await this.repo.getEvents();
    const slotCollision = currentEvents.find(
      (e) =>
        e.date === plan.targetSlot.date &&
        e.shift === plan.targetSlot.shift &&
        e.status !== EVENT_STATUS.FAILED &&
        (!plan.displacedEvent || e.id !== plan.displacedEvent.id)
    );
    if (slotCollision) {
      throw new Error('Turno destino já possui compromisso ativo.');
    }

    const cleanTitle = sourceEvent.title.replace(/\s*\(Compensação\)/gi, '').trim();
    const relocatedEvent = createEvent({
      title: cleanTitle,
      category_id: sourceEvent.category_id,
      date: plan.targetSlot.date,
      shift: plan.targetSlot.shift,
      status: EVENT_STATUS.PENDING,
      compensation_log_id: logId,
      is_compensated: true
    });
    eventsToSave.push(relocatedEvent);
    createdIds.push(relocatedEvent.id);

    if (plan.displacedEvent) {
      snapshotBefore.push({ ...plan.displacedEvent });

      if (plan.type === 'direct_replace') {
        eventsToSave.push({
          ...plan.displacedEvent,
          status: EVENT_STATUS.FAILED,
          manual_status_override: true,
          notes: `Substituído por realocação de ${sourceEvent.title}`
        });
        chainSteps.push(`Substituiu "${plan.displacedEvent.title}"`);
      } else if (plan.type === 'cascade_to_empty' || plan.type === 'cascade_replace') {
        const movedTarget = {
          ...plan.displacedEvent,
          date: plan.cascadeTargetSlot.date,
          shift: plan.cascadeTargetSlot.shift,
          start_time: SHIFTS[plan.cascadeTargetSlot.shift.toUpperCase()].start,
          end_time: SHIFTS[plan.cascadeTargetSlot.shift.toUpperCase()].end,
          compensation_log_id: logId,
          is_compensated: true
        };
        if (isEventInFuture(movedTarget)) {
          movedTarget.status = EVENT_STATUS.PENDING;
          movedTarget.manual_status_override = false;
        }
        eventsToSave.push(movedTarget);
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
      failed_event_id: sourceEvent.id,
      failed_category_id: sourceEvent.category_id,
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

  async rollbackAllActive() {
    const logs = await this.repo.getCompensationLogs();
    const active = logs.filter((l) => l.status !== 'reverted');
    for (const log of active) {
      await this.rollbackCompensation(log.id);
    }
    return active.length;
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

  async confirmAllPending() {
    const logs = await this.repo.getCompensationLogs();
    const pending = logs.filter((l) => l.status === 'pending_review');
    for (const log of pending) {
      await this.confirmCompensation(log.id);
    }
    return pending.length;
  }

  async getAlternativeSlotsForLog(logId) {
    const logs = await this.repo.getCompensationLogs();
    const log = logs.find((l) => l.id === logId);
    if (!log) return [];

    const allEvents = await this.repo.getEvents();
    const failedEvent =
      allEvents.find((e) => e.id === log.failed_event_id) ||
      (log.snapshot_before || []).find((e) => e.id === log.failed_event_id);
    if (!failedEvent) return [];

    const orderedCategories = await this.repo.getCategories();
    const settings = await this.repo.getSettings();

    return this.findBestPlans(
      failedEvent,
      orderedCategories,
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
    const failedEvent =
      allEvents.find((e) => e.id === log.failed_event_id) ||
      (log.snapshot_before || []).find((ev) => ev.id === log.failed_event_id);
    const originalSnapshot =
      (log.snapshot_before || []).find((ev) => ev.id === log.failed_event_id) || failedEvent;

    await this.repo.saveCompensationLog({ ...log, status: 'reverted' });
    return this._applyPlan(failedEvent, originalSnapshot, chosenPlan, {
      markSourceAsFailed: Boolean(allEvents.find((e) => e.id === log.failed_event_id))
    });
  }
}
