import { StorageRepository } from './StorageRepository.js';
import { EVENT_STATUS, nowISO } from '../domain/entities.js';
import { isEventInFuture, isValidDateStr, validateEventInput } from '../domain/DateUtils.js';

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
  seeded: true
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

  _snapshotAllKeys() {
    const snap = {};
    for (const key of Object.values(STORAGE_KEYS)) {
      snap[key] = localStorage.getItem(key);
    }
    return snap;
  }

  _restoreSnapshot(snap) {
    for (const [key, val] of Object.entries(snap)) {
      if (val === null || val === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    }
  }

  async commitAtomic(mutatorFn) {
    const snap = this._snapshotAllKeys();
    try {
      return await mutatorFn();
    } catch (err) {
      this._restoreSnapshot(snap);
      if (err && err.name === 'QuotaExceededError') {
        throw new Error('Armazenamento local cheio (QuotaExceededError). Exporte um backup ou limpe dados antigos.');
      }
      throw err;
    }
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
        in_global_list:
          typeof c.in_global_list === 'boolean'
            ? c.in_global_list
            : typeof c.is_sacrificeable === 'boolean'
              ? c.is_sacrificeable
              : false
      }))
      .sort((a, b) => a.priority_order - b.priority_order);
  }

  async saveCategory(category) {
    return this.commitAtomic(async () => {
      const list = await this.getCategories();
      const record = {
        ...category,
        priority_order: Number.isFinite(Number(category.priority_order))
          ? Number(category.priority_order)
          : list.length,
        is_relocatable: Boolean(category.is_relocatable),
        in_global_list: Boolean(category.in_global_list),
        updated_at: nowISO()
      };
      delete record.is_sacrificeable;

      const idx = list.findIndex((c) => c.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      this._write(STORAGE_KEYS.CATEGORIES, list);
      return record;
    });
  }

  async saveCategoriesBulk(categories) {
    return this.commitAtomic(async () => {
      const normalized = categories.map((c, idx) => {
        const rec = {
          ...c,
          priority_order: Number.isFinite(Number(c.priority_order)) ? Number(c.priority_order) : idx,
          is_relocatable: Boolean(c.is_relocatable),
          in_global_list: Boolean(c.in_global_list),
          updated_at: nowISO()
        };
        delete rec.is_sacrificeable;
        return rec;
      });
      this._write(STORAGE_KEYS.CATEGORIES, normalized);
      return normalized;
    });
  }

  async deleteCategory(id) {
    return this.commitAtomic(async () => {
      const list = (await this.getCategories()).filter((c) => c.id !== id);
      this._write(STORAGE_KEYS.CATEGORIES, list);
    });
  }

  async getEvents() {
    return this._read(STORAGE_KEYS.EVENTS, []);
  }

  async saveEvent(event) {
    return this.commitAtomic(async () => {
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
    });
  }

  async saveEventsBulk(events) {
    return this.commitAtomic(async () => {
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
    });
  }

  async deleteEvent(id) {
    return this.commitAtomic(async () => {
      const list = (await this.getEvents()).filter((e) => e.id !== id);
      this._write(STORAGE_KEYS.EVENTS, list);
    });
  }

  async deleteEventsByRecurrenceId(recurrenceId) {
    return this.commitAtomic(async () => {
      const list = (await this.getEvents()).filter((e) => e.recurrence_id !== recurrenceId);
      this._write(STORAGE_KEYS.EVENTS, list);
    });
  }

  async getRecurrences() {
    return this._read(STORAGE_KEYS.RECURRENCES, []);
  }

  async saveRecurrence(recurrence) {
    return this.commitAtomic(async () => {
      const list = await this.getRecurrences();
      const record = { ...recurrence, updated_at: nowISO() };
      const idx = list.findIndex((r) => r.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      this._write(STORAGE_KEYS.RECURRENCES, list);
      return record;
    });
  }

  async deleteRecurrence(id) {
    return this.commitAtomic(async () => {
      const list = (await this.getRecurrences()).filter((r) => r.id !== id);
      this._write(STORAGE_KEYS.RECURRENCES, list);
    });
  }

  async getSuppressedRecurrences() {
    return this._read(STORAGE_KEYS.SUPPRESSED_REC, []);
  }

  async addSuppressedRecurrence(key) {
    return this.commitAtomic(async () => {
      const list = await this.getSuppressedRecurrences();
      if (!list.includes(key)) {
        list.push(key);
        this._write(STORAGE_KEYS.SUPPRESSED_REC, list);
      }
    });
  }

  async removeSuppressedRecurrence(key) {
    return this.commitAtomic(async () => {
      const list = (await this.getSuppressedRecurrences()).filter((k) => k !== key);
      this._write(STORAGE_KEYS.SUPPRESSED_REC, list);
    });
  }

  async getCompensationLogs() {
    return this._read(STORAGE_KEYS.COMPENSATIONS, []);
  }

  async saveCompensationLog(log) {
    return this.commitAtomic(async () => {
      const list = await this.getCompensationLogs();
      const record = { ...log, updated_at: nowISO() };
      const idx = list.findIndex((l) => l.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.unshift(record);
      this._write(STORAGE_KEYS.COMPENSATIONS, list);
      return record;
    });
  }

  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...this._read(STORAGE_KEYS.SETTINGS, {}) };
  }

  async saveSettings(partial) {
    return this.commitAtomic(async () => {
      const current = await this.getSettings();
      const updated = { ...current, ...partial };
      this._write(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    });
  }

  async exportAll() {
    return {
      version: 4,
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
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.categories) || !Array.isArray(payload.events)) {
      throw new Error('Arquivo de backup inválido: categorias e eventos devem ser arrays.');
    }
    if (payload.events.length > 5000 || payload.categories.length > 500) {
      throw new Error('Arquivo de backup excede o limite permitido de registros.');
    }

    const catIds = new Set();
    for (const cat of payload.categories) {
      if (!cat || typeof cat.id !== 'string' || !cat.id.trim() || typeof cat.name !== 'string' || !cat.name.trim()) {
        throw new Error('Categoria inválida no arquivo de backup.');
      }
      if (catIds.has(cat.id)) {
        throw new Error(`ID de categoria duplicado no backup: ${cat.id}`);
      }
      catIds.add(cat.id);
    }

    const eventIds = new Set();
    const normalizedEvents = payload.events.map((ev) => {
      if (!ev || typeof ev.id !== 'string' || !ev.id.trim()) {
        throw new Error('Evento sem ID válido no backup.');
      }
      if (eventIds.has(ev.id)) {
        throw new Error(`ID de evento duplicado no backup: ${ev.id}`);
      }
      eventIds.add(ev.id);

      const check = validateEventInput(ev, { categoryIds: catIds });
      if (!check.valid) {
        throw new Error(`Evento inválido (${ev.id}): ${check.errors.join(' ')}`);
      }

      if (isEventInFuture(ev) && ev.status === EVENT_STATUS.DONE) {
        return { ...ev, status: EVENT_STATUS.PENDING, manual_status_override: false };
      }
      return ev;
    });

    const recurrences = Array.isArray(payload.recurrences) ? payload.recurrences : [];
    const suppressed = Array.isArray(payload.suppressed_recurrences)
      ? payload.suppressed_recurrences.filter((k) => typeof k === 'string')
      : [];
    const compensations = Array.isArray(payload.compensations) ? payload.compensations : [];

    for (const key of suppressed) {
      const datePart = key.split('::')[0];
      if (datePart && !isValidDateStr(datePart)) {
        throw new Error(`Chave de recorrência suprimida inválida: ${key}`);
      }
    }

    return this.commitAtomic(async () => {
      this._write(STORAGE_KEYS.CATEGORIES, payload.categories);
      this._write(STORAGE_KEYS.EVENTS, normalizedEvents);
      this._write(STORAGE_KEYS.RECURRENCES, recurrences);
      this._write(STORAGE_KEYS.SUPPRESSED_REC, suppressed);
      this._write(STORAGE_KEYS.COMPENSATIONS, compensations);
      if (payload.settings && typeof payload.settings === 'object') {
        this._write(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS, ...payload.settings });
      }
    });
  }

  async clearAll() {
    return this.commitAtomic(async () => {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
      this._write(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS, seeded: true });
    });
  }
}
