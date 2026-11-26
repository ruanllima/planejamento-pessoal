import { formatDayShort } from '../domain/DateUtils.js';
import { SHIFTS } from '../domain/entities.js';

export class CompensationsView {
  constructor({ container, repo, compensationEngine, modal, onStateChange, showToast }) {
    this.container = container;
    this.repo = repo;
    this.engine = compensationEngine;
    this.modal = modal;
    this.onStateChange = onStateChange;
    this.showToast = showToast;
  }

  async render(anchorDate) {
    const [quotas, logs] = await Promise.all([
      this.engine.getWeeklyQuotas(anchorDate),
      this.repo.getCompensationLogs()
    ]);

    const activeLogs = logs.filter((l) => l.status !== 'reverted');

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Compensações & Ajustes</h1>
          <p class="view-subtitle">Auditoria do motor dinâmico e metas semanais por categoria</p>
        </div>
      </header>

      <h2 class="field-label" style="margin-bottom:10px;">Saldo Semanal de Turnos</h2>
      <div class="quota-grid">
        ${quotas
          .map((q) => {
            const pct = q.goal ? Math.min(100, Math.round((q.scheduled / q.goal) * 100)) : 100;
            const goalLabel = q.goal ? `${q.scheduled}/${q.goal} turnos` : `${q.scheduled} agendados`;
            return `
              <div class="quota-card">
                <div class="quota-header">
                  <span style="color:${q.category.color};">● ${this._escape(q.category.name)}</span>
                  <span>${goalLabel}</span>
                </div>
                <div class="quota-bar-track">
                  <div class="quota-bar-fill" style="width:${pct}%; background-color:${q.category.color};"></div>
                </div>
                <div style="font-size:0.72rem; color:var(--text-secondary); display:flex; justify-content:space-between;">
                  <span>Concluídos: ${q.completed}</span>
                  <span>Falhas: ${q.failed}</span>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <h2 class="field-label" style="margin-bottom:10px;">Fila de Revisão e Histórico (${activeLogs.length})</h2>
      <div class="log-list" id="comp-log-list"></div>
    `;

    const listEl = this.container.querySelector('#comp-log-list');
    if (activeLogs.length === 0) {
      listEl.innerHTML = `
        <div class="panel-card" style="text-align:center; color:var(--text-secondary); padding:32px;">
          Nenhuma compensação ativa no momento. Marque falha em qualquer compromisso da Agenda para acionar o motor.
        </div>
      `;
      return;
    }

    for (const log of activeLogs) {
      const card = document.createElement('article');
      card.className = `log-card ${log.status === 'confirmed' ? 'confirmed' : 'pending-review'}`;

      const chainHtml =
        log.chain_steps && log.chain_steps.length > 0
          ? `<div class="log-chain"><strong>Efeito Dominó Executado:</strong>${log.chain_steps
              .map((s) => `<span>• ${this._escape(s)}</span>`)
              .join('')}</div>`
          : '';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span class="status-pill ${log.status === 'confirmed' ? 'realizado' : 'pendente'}">
            ${log.status === 'confirmed' ? 'Confirmado' : 'Aguardando Revisão'}
          </span>
          <span style="font-size:0.72rem; color:var(--text-muted);">${new Date(log.created_at).toLocaleString('pt-BR')}</span>
        </div>
        <p class="log-reason">${this._escape(log.reason_human)}</p>
        ${chainHtml}
        <div class="log-actions">
          ${
            log.status === 'pending_review'
              ? `<button type="button" class="btn btn-success btn-confirm">Confirmar</button>`
              : ''
          }
          <button type="button" class="btn btn-danger btn-undo">Desfazer (Rollback)</button>
          <button type="button" class="btn btn-secondary btn-reallocate">Realocar Manualmente</button>
        </div>
      `;

      const confirmBtn = card.querySelector('.btn-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          await this.engine.confirmCompensation(log.id);
          this.showToast('Realocação confirmada.');
          await this.onStateChange();
        });
      }

      card.querySelector('.btn-undo').addEventListener('click', async () => {
        await this.engine.rollbackCompensation(log.id);
        this.showToast('Estado anterior restaurado com sucesso.');
        await this.onStateChange();
      });

      card.querySelector('.btn-reallocate').addEventListener('click', async () => {
        const alternatives = await this.engine.getAlternativeSlotsForLog(log.id);
        this._openManualReallocateModal(log, alternatives);
      });

      listEl.appendChild(card);
    }
  }

  _openManualReallocateModal(log, alternatives) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    if (alternatives.length === 0) {
      wrap.innerHTML = `<p style="color:var(--text-secondary);">Não há outros slots compatíveis disponíveis para esta categoria.</p>`;
    } else {
      for (const plan of alternatives.slice(0, 6)) {
        const item = document.createElement('div');
        item.className = 'panel-card';
        item.style.marginBottom = '0';
        const shiftLabel = SHIFTS[plan.targetSlot.shift.toUpperCase()].label;

        item.innerHTML = `
          <div style="font-weight:700; font-size:0.875rem; margin-bottom:4px;">
            ${formatDayShort(plan.targetSlot.date)} • ${shiftLabel}
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px;">
            ${this._escape(plan.summary)}
          </div>
          <button type="button" class="btn btn-primary" style="width:100%;">Escolher este slot</button>
        `;

        item.querySelector('button').addEventListener('click', async () => {
          await this.engine.reallocateLogToPlan(log.id, plan);
          this.modal.close();
          this.showToast('Slot atualizado manualmente.');
          await this.onStateChange();
        });

        wrap.appendChild(item);
      }
    }

    this.modal.open('Próximos Melhores Slots Válidos', wrap);
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
