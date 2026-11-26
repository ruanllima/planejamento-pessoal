import { StorageRepository } from './StorageRepository.js';
import { nowISO } from '../domain/entities.js';

const STORAGE_KEYS = {
  CATEGORIES: 'chronos_categories_v1',
  EVENTS: 'chronos_events_v1',
  RECURRENCES: 'chronos_recurrences_v1',
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
    return this._read(STORAGE_KEYS.CATEGORIES, []);
  }

  async saveCategory(category) {
    const list = await this.getCategories();
    const record = { ...category, updated_at: nowISO() };
    const idx = list.findIndex((c) => c.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this._write(STORAGE_KEYS.CATEGORIES, list);
    return record;
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
    const idx = list.findIndex((e) => e.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this._write(STORAGE_KEYS.EVENTS, list);
    return record;
  }

  async saveEventsBulk(events) {
    const list = await this.getEvents();
    const map = new Map(list.map((e) => [e.id, e]));
    for (const ev of events) {
      map.set(ev.id, { ...ev, updated_at: nowISO() });
    }
    const merged = Array.from(map.values());
    this._write(STORAGE_KEYS.EVENTS, merged);
    return merged;
  }

  async deleteEvent(id) {
    const list = (await this.getEvents()).filter((e) => e.id !== id);
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
      version: 1,
      exported_at: nowISO(),
      categories: await this.getCategories(),
      events: await this.getEvents(),
      recurrences: await this.getRecurrences(),
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
