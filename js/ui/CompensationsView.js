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
    const hasPendingLogs = activeLogs.some((l) => l.status === 'pending_review');

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Compensações e Ajustes</h1>
          <p class="view-subtitle">Auditoria do motor dinâmico e metas semanais por categoria</p>
        </div>
      </header>

      <h2 class="field-label" style="margin-bottom:10px;">Saldo Semanal de Turnos</h2>
      ${
        quotas.length > 0
          ? `<div class="quota-grid">
              ${quotas
                .map((q) => {
                  const pct = Math.min(100, Math.round((q.scheduled / q.goal) * 100));
                  const goalLabel = `${q.scheduled}/${q.goal} turnos`;
                  return `
                    <div class="quota-card">
                      <div class="quota-header">
                        <span style="color:${q.category.color};">${this._escape(q.category.name)}</span>
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
            </div>`
          : `<div class="panel-card" style="color:var(--text-secondary); font-size:0.84rem; margin-bottom:24px;">
              Nenhuma categoria possui meta semanal definida no momento. Configure uma meta em Ajustes para acompanhá-la aqui.
            </div>`
      }

      <h2 class="field-label" style="margin-bottom:10px;">Fila de Revisão e Histórico (${activeLogs.length})</h2>
      <div class="log-list" id="comp-log-list"></div>

      ${
        activeLogs.length > 0
          ? `
        <div class="panel-card" style="margin-top:20px; display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end;">
          ${
            hasPendingLogs
              ? `<button type="button" class="btn btn-success" id="btn-confirm-all">Confirmar todos</button>`
              : ''
          }
          <button type="button" class="btn btn-danger" id="btn-undo-all">Desfazer todos</button>
        </div>
      `
          : ''
      }
    `;

    const listEl = this.container.querySelector('#comp-log-list');
    if (activeLogs.length === 0) {
      listEl.innerHTML = `
        <div class="panel-card" style="text-align:center; color:var(--text-secondary); padding:32px;">
          Nenhuma compensação ativa no momento.
        </div>
      `;
      return;
    }

    const confirmAllBtn = this.container.querySelector('#btn-confirm-all');
    if (confirmAllBtn) {
      confirmAllBtn.addEventListener('click', async () => {
        const count = await this.engine.confirmAllPending();
        this.showToast(`${count} compensação(ões) confirmada(s).`);
        await this.onStateChange();
      });
    }

    const undoAllBtn = this.container.querySelector('#btn-undo-all');
    if (undoAllBtn) {
      undoAllBtn.addEventListener('click', () => {
        this._confirmUndoAllModal(activeLogs.length);
      });
    }

    for (const log of activeLogs) {
      const card = document.createElement('article');
      card.className = `log-card ${log.status === 'confirmed' ? 'confirmed' : 'pending-review'}`;

      const chainHtml =
        log.chain_steps && log.chain_steps.length > 0
          ? `<div class="log-chain"><strong>Efeito Dominó Executado:</strong>${log.chain_steps
              .map((s) => `<span>${this._escape(s)}</span>`)
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
        this.showToast('Estado anterior restaurado.');
        await this.onStateChange();
      });

      card.querySelector('.btn-reallocate').addEventListener('click', async () => {
        const alternatives = await this.engine.getAlternativeSlotsForLog(log.id);
        this._openManualReallocateModal(log, alternatives);
      });

      listEl.appendChild(card);
    }
  }

  _confirmUndoAllModal(totalCount) {
    const wrap = document.createElement('div');
    wrap.className = 'form-grid';
    wrap.innerHTML = `
      <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
        Deseja desfazer todas as <strong>${totalCount}</strong> compensação(ões) ativa(s) e restaurar os turnos originais?
      </p>
      <div class="modal-footer-actions">
        <button type="button" class="btn btn-secondary" style="flex:1;" id="undo-all-cancel">Cancelar</button>
        <button type="button" class="btn btn-danger" style="flex:1;" id="undo-all-confirm">Desfazer todos</button>
      </div>
    `;

    wrap.querySelector('#undo-all-cancel').addEventListener('click', () => this.modal.close());
    wrap.querySelector('#undo-all-confirm').addEventListener('click', async () => {
      const revertedCount = await this.engine.rollbackAllActive();
      this.modal.close();
      this.showToast(`${revertedCount} compensação(ões) desfeita(s).`);
      await this.onStateChange();
    });

    this.modal.open('Desfazer todas as compensações', wrap);
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
            ${formatDayShort(plan.targetSlot.date)} (${shiftLabel})
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
