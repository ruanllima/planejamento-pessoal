import { LocalStorageAdapter } from './repositories/LocalStorageAdapter.js';
import { RecurrenceService } from './services/RecurrenceService.js';
import { StatusLifecycleService } from './services/StatusLifecycleService.js';
import { CompensationEngine } from './services/CompensationEngine.js';
import { AgendaView } from './ui/AgendaView.js';
import { CompensationsView } from './ui/CompensationsView.js';
import { RecurrencesView } from './ui/RecurrencesView.js';
import { SettingsView } from './ui/SettingsView.js';
import { ModalManager } from './ui/ModalManager.js';
import { ToastManager } from './ui/ToastManager.js';

class RitmApp {
  constructor() {
    this.repo = new LocalStorageAdapter();
    this.recurrenceService = new RecurrenceService(this.repo);
    this.lifecycleService = new StatusLifecycleService(this.repo);
    this.compensationEngine = new CompensationEngine(this.repo);

    this.modal = new ModalManager();
    this.toast = new ToastManager();
    this.activeTab = 'agenda';

    const onStateChange = () => this.refreshAll();
    const showToast = (msg, actionLabel = null, onAction = null) =>
      this.toast.show(msg, actionLabel, onAction);

    this.agendaView = new AgendaView({
      container: document.getElementById('view-agenda'),
      repo: this.repo,
      compensationEngine: this.compensationEngine,
      recurrenceService: this.recurrenceService,
      modal: this.modal,
      onStateChange,
      showToast
    });

    this.compensationsView = new CompensationsView({
      container: document.getElementById('view-compensations'),
      repo: this.repo,
      compensationEngine: this.compensationEngine,
      modal: this.modal,
      onStateChange,
      showToast
    });

    this.recurrencesView = new RecurrencesView({
      container: document.getElementById('view-recurrences'),
      repo: this.repo,
      modal: this.modal,
      onStateChange,
      showToast
    });

    this.settingsView = new SettingsView({
      container: document.getElementById('view-settings'),
      repo: this.repo,
      modal: this.modal,
      onStateChange,
      showToast
    });
  }

  async init() {
    const settings = await this.repo.getSettings();
    if (!settings.seeded) {
      await this.repo.saveSettings({ seeded: true });
    }
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');

    await this.recurrenceService.enforceSingleEventPerSlot();
    await this.lifecycleService.syncStatuses();

    this._bindNavigation();
    this._bindLiquidGlassSpecular();
    this._registerServiceWorker();
    await this.refreshAll();

    setInterval(async () => {
      const changed = await this.lifecycleService.syncStatuses();
      if (changed > 0) await this.refreshAll();
    }, 60 * 1000);
  }

  _bindLiquidGlassSpecular() {
    const updateGlassPointer = (clientX, clientY, target) => {
      const surface = target?.closest?.('.app-nav, .modal-sheet, .toast-card, .segmented-control');
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
      const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * 100;
      surface.style.setProperty('--lg-pointer-x', `${x.toFixed(1)}%`);
      surface.style.setProperty('--lg-pointer-y', `${y.toFixed(1)}%`);
      surface.style.setProperty('--lg-pointer-active', '1');
    };

    document.addEventListener(
      'pointermove',
      (e) => updateGlassPointer(e.clientX, e.clientY, e.target),
      { passive: true }
    );

    document.addEventListener(
      'pointerdown',
      (e) => updateGlassPointer(e.clientX, e.clientY, e.target),
      { passive: true }
    );
  }

  _bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const isSelected = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-selected', String(isSelected));
    });

    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('hidden', sec.id !== `view-${tabName}`);
      sec.classList.toggle('active', sec.id === `view-${tabName}`);
    });

    this.refreshAll();
  }

  async refreshAll() {
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
    const badgeEl = document.getElementById('comp-badge');
    if (pendingCount > 0) {
      badgeEl.textContent = String(pendingCount);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new RitmApp();
  app.init();
});
