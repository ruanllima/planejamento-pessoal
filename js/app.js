import { LocalStorageAdapter } from './repositories/LocalStorageAdapter.js';
import { StatusLifecycleService } from './services/StatusLifecycleService.js';
import { RecurrenceService } from './services/RecurrenceService.js';
import { CompensationEngine } from './services/CompensationEngine.js';
import { SeedService } from './services/SeedService.js';
import { ModalManager } from './ui/ModalManager.js';
import { ToastManager } from './ui/ToastManager.js';
import { AgendaView } from './ui/AgendaView.js';
import { CompensationsView } from './ui/CompensationsView.js';
import { RecurrencesView } from './ui/RecurrencesView.js';
import { SettingsView } from './ui/SettingsView.js';

class AppController {
  constructor() {
    this.repo = new LocalStorageAdapter();

    this.lifecycleService = new StatusLifecycleService(this.repo);
    this.recurrenceService = new RecurrenceService(this.repo);
    this.compensationEngine = new CompensationEngine(this.repo);
    this.seedService = new SeedService(this.repo);

    this.modal = new ModalManager();
    this.toast = new ToastManager('toast-container');

    this.activeTab = 'agenda';

    this.agendaView = new AgendaView({
      container: document.getElementById('view-agenda'),
      repo: this.repo,
      compensationEngine: this.compensationEngine,
      recurrenceService: this.recurrenceService,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) =>
        this.toast.show(msg, actionText, onAction)
    });

    this.compensationsView = new CompensationsView({
      container: document.getElementById('view-compensations'),
      repo: this.repo,
      compensationEngine: this.compensationEngine,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) =>
        this.toast.show(msg, actionText, onAction)
    });

    this.recurrencesView = new RecurrencesView({
      container: document.getElementById('view-recurrences'),
      repo: this.repo,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) =>
        this.toast.show(msg, actionText, onAction)
    });

    this.settingsView = new SettingsView({
      container: document.getElementById('view-settings'),
      repo: this.repo,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) =>
        this.toast.show(msg, actionText, onAction)
    });
  }

  async init() {
    this._registerServiceWorker();

    await this.seedService.seedIfNeeded();

    const settings = await this.repo.getSettings();

    document.documentElement.setAttribute(
      'data-theme',
      settings.theme || 'dark'
    );

    this._bindNavigation();

    await this.refreshAll();

    setInterval(async () => {
      const updated = await this.lifecycleService.syncStatuses();

      if (updated > 0) {
        await this.refreshAll();
      }
    }, 60000);
  }

  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn('Service Worker não registrado:', error);
      });

    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    });
  }

  _bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeTab = button.dataset.tab;

        document.querySelectorAll('.nav-btn').forEach((navButton) => {
          const isTarget = navButton.dataset.tab === this.activeTab;

          navButton.classList.toggle('active', isTarget);
          navButton.setAttribute('aria-selected', String(isTarget));
        });

        document.querySelectorAll('.view-section').forEach((section) => {
          section.classList.toggle(
            'hidden',
            section.id !== `view-${this.activeTab}`
          );
        });

        this.refreshAll();
      });
    });
  }

  async refreshAll() {
    await this.recurrenceService.enforceSingleEventPerSlot();

    await this.lifecycleService.syncStatuses();

    await this._updateCompensationBadge();

    const appMain = document.getElementById('app-main');

    if (appMain) {
      appMain.classList.toggle(
        'has-agenda-header',
        this.activeTab === 'agenda'
      );
    }

    switch (this.activeTab) {
      case 'agenda':
        await this.agendaView.render();
        break;

      case 'compensations':
        await this.compensationsView.render(this.agendaView.anchorDate);
        break;

      case 'recurrences':
        await this.recurrencesView.render();
        break;

      case 'settings':
        await this.settingsView.render();
        break;
    }
  }

  async _updateCompensationBadge() {
    const logs = await this.repo.getCompensationLogs();

    const pendingCount = logs.filter(
      (log) => log.status === 'pending_review'
    ).length;

    const badge = document.getElementById('comp-badge');

    if (!badge) {
      return;
    }

    if (pendingCount > 0) {
      badge.textContent = String(pendingCount);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});