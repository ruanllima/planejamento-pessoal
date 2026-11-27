import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createCategory, createEvent, EVENT_STATUS } from '../js/domain/entities.js';
import { isEventInFuture, isSlotOccupying, validateEventInput, validateCategoryInput } from '../js/domain/DateUtils.js';
import { StatusLifecycleService } from '../js/services/StatusLifecycleService.js';
import { CompensationEngine } from '../js/services/CompensationEngine.js';
import { RecurrenceService } from '../js/services/RecurrenceService.js';

function createMemoryStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); }
  };
  return store;
}

const { LocalStorageAdapter } = await import('../js/repositories/LocalStorageAdapter.js');

describe('Auditoria Ritm — Testes Unitarios, Integracao e Regressao', () => {
  let store;
  let repo;

  beforeEach(async () => {
    store = createMemoryStorageMock();
    repo = new LocalStorageAdapter();
    await repo.clearAll();
  });

  it('UT-ENTITY-01/02 & UT-SLOT-01: validacao de entidades e unicidade de slot', async () => {
    assert.equal(validateCategoryInput({ name: '   ', allowed_shifts: ['morning'] }).valid, false);
    assert.equal(validateCategoryInput({ name: 'Estudo', weekly_goal: -2, allowed_shifts: ['morning'] }).valid, false);
    assert.equal(validateCategoryInput({ name: 'Estudo', weekly_goal: 3, allowed_shifts: ['morning'] }).valid, true);

    const ev1 = createEvent({ title: 'Bloco A', category_id: 'c1', date: '2026-12-10', shift: 'morning' });
    const ev2 = createEvent({ title: 'Bloco B', category_id: 'c1', date: '2026-12-10', shift: 'morning' });
    await repo.saveEvent(ev1);
    await repo.saveEvent(ev2);

    const events = await repo.getEvents();
    const morningEvents = events.filter((e) => e.date === '2026-12-10' && e.shift === 'morning');
    assert.equal(morningEvents.length, 1);
    assert.equal(morningEvents[0].id, ev2.id);
    assert.equal(isSlotOccupying(morningEvents[0], new Date('2026-12-01T10:00:00')), true);
  });

  it('P1-01/02: lifecycle nao marca pendente como realizado no inicio do turno e respeita futuro', async () => {
    const lifecycle = new StatusLifecycleService(repo);
    const futureEv = createEvent({
      id: 'ev-fut',
      title: 'Futuro',
      category_id: 'c1',
      date: '2026-12-20',
      shift: 'morning',
      status: EVENT_STATUS.DONE
    });
    const pastPendingEv = createEvent({
      id: 'ev-past',
      title: 'Ontem Pendente',
      category_id: 'c1',
      date: '2026-11-26',
      shift: 'morning',
      status: EVENT_STATUS.PENDING
    });
    await repo.saveEventsBulk([futureEv, pastPendingEv]);

    const now = new Date('2026-11-27T08:00:00');
    assert.equal(isEventInFuture(futureEv, now), true);

    await lifecycle.syncStatuses(now);
    const updated = await repo.getEvents();
    const futAfter = updated.find((e) => e.id === 'ev-fut');
    const pastAfter = updated.find((e) => e.id === 'ev-past');

    assert.equal(futAfter.status, EVENT_STATUS.PENDING);
    assert.notEqual(pastAfter.status, EVENT_STATUS.DONE);
    assert.equal(pastAfter.status, EVENT_STATUS.FAILED);
  });

  it('P0-02 & P1-04: compensacao idempotente e rollback protege edicao posterior do usuario', async () => {
    const engine = new CompensationEngine(repo);
    const catWork = createCategory({ id: 'cat-work', name: 'Trabalho', priority_order: 0, is_relocatable: true, in_global_list: false });
    const catFree = createCategory({ id: 'cat-free', name: 'Livre', priority_order: 1, is_relocatable: true, in_global_list: true });
    await repo.saveCategoriesBulk([catWork, catFree]);

    const evWork = createEvent({
      id: 'ev-work-1',
      title: 'Turno Trabalho',
      category_id: 'cat-work',
      date: '2026-11-27',
      shift: 'morning',
      status: EVENT_STATUS.PENDING
    });
    const evFree = createEvent({
      id: 'ev-free-1',
      title: 'Turno Livre',
      category_id: 'cat-free',
      date: '2026-11-27',
      shift: 'afternoon',
      status: EVENT_STATUS.PENDING
    });
    await repo.saveEventsBulk([evWork, evFree]);

    const firstComp = await engine.markEventAsFailedAndCompensate('ev-work-1');
    assert.equal(firstComp.compensated, true);
    const logsAfterFirst = await repo.getCompensationLogs();
    assert.equal(logsAfterFirst.filter((l) => l.status !== 'reverted').length, 1);

    const secondComp = await engine.markEventAsFailedAndCompensate('ev-work-1');
    assert.equal(secondComp.compensated, false);
    const logsAfterSecond = await repo.getCompensationLogs();
    assert.equal(logsAfterSecond.filter((l) => l.status !== 'reverted').length, 1);

    const createdId = firstComp.log.created_event_ids[0];
    const eventsNow = await repo.getEvents();
    const createdEv = eventsNow.find((e) => e.id === createdId);
    await repo.saveEvent({ ...createdEv, title: 'Editado pelo Usuario' });

    const rollbackConflict = await engine.rollbackCompensation(firstComp.log.id);
    assert.equal(rollbackConflict.reverted, false);
    assert.equal(rollbackConflict.conflict, true);

    const rollbackForced = await engine.rollbackCompensation(firstComp.log.id, { forceOverwrite: true });
    assert.equal(rollbackForced.reverted, true);
    const rollbackRepeat = await engine.rollbackCompensation(firstComp.log.id);
    assert.equal(rollbackRepeat.reverted, false);
  });

  it('P0-04: importacao rejeita IDs duplicados e faz round-trip valido', async () => {
    const cat = createCategory({ id: 'cat-1', name: 'Estudo' });
    const ev = createEvent({ id: 'ev-1', title: 'Algoritmos', category_id: 'cat-1', date: '2026-12-05', shift: 'night' });
    await repo.saveCategoriesBulk([cat]);
    await repo.saveEvent(ev);

    const exported = await repo.exportAll();
    const invalidDup = {
      ...exported,
      events: [ev, { ...ev }]
    };

    await assert.rejects(() => repo.importAll(invalidDup), /duplicado/i);

    await repo.clearAll();
    await repo.importAll(exported);
    const importedEvents = await repo.getEvents();
    assert.equal(importedEvents.length, 1);
    assert.equal(importedEvents[0].title, 'Algoritmos');
    assert.equal(validateEventInput(importedEvents[0]).valid, true);
  });

  it('P1-05: recorrencia nao duplica ocorrencias e respeita ocorrencia suprimida', async () => {
    const recService = new RecurrenceService(repo);
    const cat = createCategory({ id: 'cat-rec', name: 'Igreja' });
    await repo.saveCategoriesBulk([cat]);
    await repo.saveRecurrence({
      id: 'rec-1',
      title: 'Culto',
      category_id: 'cat-rec',
      frequency: 'weekly',
      days_of_week: [0],
      day_of_month: null,
      shifts: ['morning'],
      start_time: null,
      end_time: null,
      active: true
    });

    const created1 = await recService.ensureEventsForRange(['2026-11-29']);
    assert.equal(created1, 1);
    const created2 = await recService.ensureEventsForRange(['2026-11-29']);
    assert.equal(created2, 0);

    const [ev] = await repo.getEvents();
    await repo.addSuppressedRecurrence('2026-11-29::morning::rec-1');
    await repo.deleteEvent(ev.id);
    const created3 = await recService.ensureEventsForRange(['2026-11-29']);
    assert.equal(created3, 0);
  });
});
