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
      showToast: (msg, actionText, onAction) => this.toast.show(msg, actionText, onAction)
    });

    this.compensationsView = new CompensationsView({
      container: document.getElementById('view-compensations'),
      repo: this.repo,
      compensationEngine: this.compensationEngine,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) => this.toast.show(msg, actionText, onAction)
    });

    this.recurrencesView = new RecurrencesView({
      container: document.getElementById('view-recurrences'),
      repo: this.repo,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) => this.toast.show(msg, actionText, onAction)
    });

    this.settingsView = new SettingsView({
      container: document.getElementById('view-settings'),
      repo: this.repo,
      modal: this.modal,
      onStateChange: () => this.refreshAll(),
      showToast: (msg, actionText, onAction) => this.toast.show(msg, actionText, onAction)
    });
  }

  async init() {
    this._registerServiceWorker();
    await this.seedService.seedIfNeeded();

    const settings = await this.repo.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');

    this._bindNavigation();
    await this.refreshAll();

    setInterval(async () => {
      const updated = await this.lifecycleService.syncStatuses();
      if (updated > 0) await this.refreshAll();
    }, 60000);
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service Worker não registrado:', err);
      });
    }
  }

  _bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        document.querySelectorAll('.nav-btn').forEach((b) => {
          const isTarget = b.dataset.tab === this.activeTab;
          b.classList.toggle('active', isTarget);
          b.setAttribute('aria-selected', String(isTarget));
        });

        document.querySelectorAll('.view-section').forEach((sec) => {
          sec.classList.toggle('hidden', sec.id !== `view-${this.activeTab}`);
        });

        this.refreshAll();
      });
    });
  }

  async refreshAll() {
    await this.lifecycleService.syncStatuses();
    await this._updateCompensationBadge();

    if (this.activeTab === 'agenda') {
      await this.agendaView.render();
    } else if (this.activeTab === 'compensations') {
      await this.compensationsView.render(this.agendaView.anchorDate);
    } else if (this.activeTab === 'recurrences') {
      await this.recurrencesView.render();
    } else if (this.activeTab === 'settings') {
      await this.settingsView.render();
    }
  }

  async _updateCompensationBadge() {
    const logs = await this.repo.getCompensationLogs();
    const pendingCount = logs.filter((l) => l.status === 'pending_review').length;
    const badge = document.getElementById('comp-badge');
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
