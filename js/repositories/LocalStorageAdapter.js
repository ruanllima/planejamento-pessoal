import { StorageRepository } from './StorageRepository.js';
import { EVENT_STATUS, nowISO } from '../domain/entities.js';
import { isEventInFuture } from '../domain/DateUtils.js';

const STORAGE_KEYS = {
  CATEGORIES: 'chronos_categories_v1',
  EVENTS: 'chronos_events_v1',
  RECURRENCES: 'chronos_recurrences_v1',
  SUPPRESSED_REC: 'chronos_suppressed_rec_v1',
  COMPENSATIONS: 'chronos_compensations_v1',
  SETTINGS: 'chronos_settings_v1'
};

const DEFAULT_SETTINGS = {
  time_mode: 'shifts',
  theme: 'dark',
  allow_next_week_spillover: true,
  seeded: false
};

export class LocalStorageAdapter extends StorageRepository {
  _read(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error(`Erro ao ler ${key}:`, err);
      return fallback;
    }
  }

  _write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  async getCategories() {
    const raw = this._read(STORAGE_KEYS.CATEGORIES, []);
    return raw
      .map((c, idx) => ({
        ...c,
        priority_order: Number.isFinite(Number(c.priority_order)) ? Number(c.priority_order) : idx,
        is_relocatable:
          typeof c.is_relocatable === 'boolean'
            ? c.is_relocatable
            : typeof c.is_compensable === 'boolean'
              ? c.is_compensable
              : true,
        is_sacrificeable: typeof c.is_sacrificeable === 'boolean' ? c.is_sacrificeable : true
      }))
      .sort((a, b) => a.priority_order - b.priority_order);
  }

  async saveCategory(category) {
    const list = await this.getCategories();
    const record = {
      ...category,
      priority_order: Number.isFinite(Number(category.priority_order))
        ? Number(category.priority_order)
        : list.length,
      is_relocatable: Boolean(category.is_relocatable),
      is_sacrificeable: Boolean(category.is_sacrificeable),
      updated_at: nowISO()
    };
    const idx = list.findIndex((c) => c.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this._write(STORAGE_KEYS.CATEGORIES, list);
    return record;
  }

  async saveCategoriesBulk(categories) {
    const normalized = categories.map((c, idx) => ({
      ...c,
      priority_order: Number.isFinite(Number(c.priority_order)) ? Number(c.priority_order) : idx,
      is_relocatable: Boolean(c.is_relocatable),
      is_sacrificeable: Boolean(c.is_sacrificeable),
      updated_at: nowISO()
    }));
    this._write(STORAGE_KEYS.CATEGORIES, normalized);
    return normalized;
  }

  async deleteCategory(id) {
    const list = (await this.getCategories()).filter((c) => c.id !== id);
    this._write(STORAGE_KEYS.CATEGORIES, list);
  }

  async getEvents() {
    return this._read(STORAGE_KEYS.EVENTS, []);
  }

  async saveEvent(event) {
    const list = await this.getEvents();
    const record = { ...event, updated_at: nowISO() };

    const filtered = list.filter((existing) => {
      if (existing.id === record.id) return false;
      const sameSlot = existing.date === record.date && existing.shift === record.shift;
      if (!sameSlot) return true;
      const bothOccupied =
        (isEventInFuture(existing) || existing.status !== EVENT_STATUS.FAILED) &&
        (isEventInFuture(record) || record.status !== EVENT_STATUS.FAILED);
      return !bothOccupied;
    });

    filtered.push(record);
    this._write(STORAGE_KEYS.EVENTS, filtered);
    return record;
  }

  async saveEventsBulk(events) {
    const list = await this.getEvents();
    const map = new Map(list.map((e) => [e.id, e]));
    for (const ev of events) {
      map.set(ev.id, { ...ev, updated_at: nowISO() });
    }

    const incomingIds = new Set(events.map((e) => e.id));
    const allMerged = Array.from(map.values());
    const result = [];
    const occupiedSlotById = new Map();

    for (const ev of allMerged) {
      if (!incomingIds.has(ev.id)) continue;
      const slotKey = `${ev.date}::${ev.shift}`;
      const isOccupied = isEventInFuture(ev) || ev.status !== EVENT_STATUS.FAILED;
      if (isOccupied) occupiedSlotById.set(slotKey, ev.id);
      result.push(ev);
    }

    for (const ev of allMerged) {
      if (incomingIds.has(ev.id)) continue;
      const slotKey = `${ev.date}::${ev.shift}`;
      const isOccupied = isEventInFuture(ev) || ev.status !== EVENT_STATUS.FAILED;
      if (isOccupied && occupiedSlotById.has(slotKey)) {
        continue;
      }
      if (isOccupied) occupiedSlotById.set(slotKey, ev.id);
      result.push(ev);
    }

    this._write(STORAGE_KEYS.EVENTS, result);
    return result;
  }

  async deleteEvent(id) {
    const list = (await this.getEvents()).filter((e) => e.id !== id);
    this._write(STORAGE_KEYS.EVENTS, list);
  }

  async deleteEventsByRecurrenceId(recurrenceId) {
    const list = (await this.getEvents()).filter((e) => e.recurrence_id !== recurrenceId);
    this._write(STORAGE_KEYS.EVENTS, list);
  }

  async getRecurrences() {
    return this._read(STORAGE_KEYS.RECURRENCES, []);
  }

  async saveRecurrence(recurrence) {
    const list = await this.getRecurrences();
    const record = { ...recurrence, updated_at: nowISO() };
    const idx = list.findIndex((r) => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this._write(STORAGE_KEYS.RECURRENCES, list);
    return record;
  }

  async deleteRecurrence(id) {
    const list = (await this.getRecurrences()).filter((r) => r.id !== id);
    this._write(STORAGE_KEYS.RECURRENCES, list);
  }

  async getSuppressedRecurrences() {
    return this._read(STORAGE_KEYS.SUPPRESSED_REC, []);
  }

  async addSuppressedRecurrence(key) {
    const list = await this.getSuppressedRecurrences();
    if (!list.includes(key)) {
      list.push(key);
      this._write(STORAGE_KEYS.SUPPRESSED_REC, list);
    }
  }

  async removeSuppressedRecurrence(key) {
    const list = (await this.getSuppressedRecurrences()).filter((k) => k !== key);
    this._write(STORAGE_KEYS.SUPPRESSED_REC, list);
  }

  async getCompensationLogs() {
    return this._read(STORAGE_KEYS.COMPENSATIONS, []);
  }

  async saveCompensationLog(log) {
    const list = await this.getCompensationLogs();
    const record = { ...log, updated_at: nowISO() };
    const idx = list.findIndex((l) => l.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    this._write(STORAGE_KEYS.COMPENSATIONS, list);
    return record;
  }

  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...this._read(STORAGE_KEYS.SETTINGS, {}) };
  }

  async saveSettings(partial) {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    this._write(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }

  async exportAll() {
    return {
      version: 3,
      exported_at: nowISO(),
      categories: await this.getCategories(),
      events: await this.getEvents(),
      recurrences: await this.getRecurrences(),
      suppressed_recurrences: await this.getSuppressedRecurrences(),
      compensations: await this.getCompensationLogs(),
      settings: await this.getSettings()
    };
  }

  async importAll(payload) {
    if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.events)) {
      throw new Error('Arquivo de backup inválido.');
    }
    this._write(STORAGE_KEYS.CATEGORIES, payload.categories);
    this._write(STORAGE_KEYS.EVENTS, payload.events);
    this._write(STORAGE_KEYS.RECURRENCES, payload.recurrences || []);
    this._write(STORAGE_KEYS.SUPPRESSED_REC, payload.suppressed_recurrences || []);
    this._write(STORAGE_KEYS.COMPENSATIONS, payload.compensations || []);
    if (payload.settings) {
      this._write(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS, ...payload.settings });
    }
  }

  async clearAll() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    await this.saveSettings({ seeded: true });
  }
}
