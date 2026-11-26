export class StorageRepository {
  async getCategories() { throw new Error('Not implemented'); }
  async saveCategory(category) { throw new Error('Not implemented'); }
  async deleteCategory(id) { throw new Error('Not implemented'); }

  async getEvents() { throw new Error('Not implemented'); }
  async saveEvent(event) { throw new Error('Not implemented'); }
  async saveEventsBulk(events) { throw new Error('Not implemented'); }
  async deleteEvent(id) { throw new Error('Not implemented'); }

  async getRecurrences() { throw new Error('Not implemented'); }
  async saveRecurrence(recurrence) { throw new Error('Not implemented'); }
  async deleteRecurrence(id) { throw new Error('Not implemented'); }

  async getCompensationLogs() { throw new Error('Not implemented'); }
  async saveCompensationLog(log) { throw new Error('Not implemented'); }

  async getSettings() { throw new Error('Not implemented'); }
  async saveSettings(settings) { throw new Error('Not implemented'); }

  async exportAll() { throw new Error('Not implemented'); }
  async importAll(payload) { throw new Error('Not implemented'); }
  async clearAll() { throw new Error('Not implemented'); }
}
