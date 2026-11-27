export class SeedService {
  constructor(repository) {
    this.repo = repository;
  }

  async seedIfNeeded() {
    const settings = await this.repo.getSettings();
    if (!settings.seeded) {
      await this.repo.saveSettings({ seeded: true });
    }
    return false;
  }
}