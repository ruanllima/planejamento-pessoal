import { createRecurrence, EVENT_STATUS, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';
import { toDateStr } from '../domain/DateUtils.js';

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export class RecurrencesView {
  constructor({ container, repo, modal, onStateChange, showToast }) {
    this.container = container;
    this.repo = repo;
    this.modal = modal;
    this.onStateChange = onStateChange;
    this.showToast = showToast;
  }

  async render() {
    const [categories, recurrences] = await Promise.all([
      this.repo.getCategories(),
      this.repo.getRecurrences()
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Recorrências</h1>
          <p class="view-subtitle">Padrões semanais ou mensais aplicados dinamicamente sem duplicar dados</p>
        </div>
      </header>

      <div class="panel-card">
        <h2 class="field-label" style="margin-bottom:12px;">Criar Nova Regra Recorrente</h2>
        <form id="rec-form" class="form-grid">
          <div class="form-grid form-grid-2">
            <div class="field-group">
              <label class="field-label" for="rec-title">Nome do Bloco</label>
              <input class="input-control" id="rec-title" type="text" required placeholder="Ex: Culto Dominical" />
            </div>
            <div class="field-group">
              <label class="field-label" for="rec-cat">Categoria</label>
              <select class="input-control" id="rec-cat">
                ${categories.map((c) => `<option value="${c.id}">${this._escape(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-grid form-grid-2">
            <div class="field-group">
              <label class="field-label" for="rec-freq">Frequência</label>
              <select class="input-control" id="rec-freq">
                <option value="weekly">Semanal (Dias da semana)</option>
                <option value="monthly">Mensal (Dia fixo do mês)</option>
              </select>
            </div>
            <div class="field-group" id="rec-dom-group" style="display:none;">
              <label class="field-label" for="rec-dom">Dia do Mês (1 a 31)</label>
              <input class="input-control" id="rec-dom" type="number" min="1" max="31" value="1" />
            </div>
          </div>

          <div class="field-group" id="rec-dow-group">
            <span class="field-label">Dias da Semana</span>
            <div class="checkbox-pills" id="rec-dow-pills">
              ${DAYS_PT.map(
                (name, idx) =>
                  `<button type="button" class="pill-toggle ${idx === 0 ? 'selected' : ''}" data-dow="${idx}">${name}</button>`
              ).join('')}
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">Turnos Aplicados</span>
            <div class="checkbox-pills" id="rec-shift-pills">
              ${SHIFT_ORDER.map((sId) => {
                const s = SHIFTS[sId.toUpperCase()];
                return `<button type="button" class="pill-toggle ${sId === 'morning' ? 'selected' : ''}" data-shift="${sId}">${s.label}</button>`;
              }).join('')}
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="margin-top:8px;">Salvar</button>
        </form>
      </div>

      <h2 class="field-label" style="margin-bottom:10px;">Regras Ativas (${recurrences.length})</h2>
      <div id="rec-list" class="log-list"></div>
    `;

    this._bindForm();

    const listEl = this.container.querySelector('#rec-list');
    for (const rec of recurrences) {
      const cat = catMap.get(rec.category_id);
      const whenLabel =
        rec.frequency === 'weekly'
          ? rec.days_of_week.map((d) => DAYS_PT[d]).join(', ')
          : `Todo dia ${rec.day_of_month}`;
      const shiftsLabel = rec.shifts.map((s) => SHIFTS[s.toUpperCase()].label).join(', ');

      const item = document.createElement('div');
      item.className = 'cat-struct-card';
      item.style.setProperty('--cat-color', cat ? cat.color : '#64748B');
      item.innerHTML = `
        <div class="cat-struct-top">
          <span class="cat-struct-title">${this._escape(rec.title)}</span>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary btn-edit-rec">Editar</button>
            <button type="button" class="btn btn-danger btn-del-rec">Remover</button>
          </div>
        </div>
        <div class="cat-struct-rows">
          <div class="cat-struct-row">
            <span class="cat-struct-key">Categoria</span>
            <span class="cat-struct-val">${cat ? this._escape(cat.name) : ''}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Frequência</span>
            <span class="cat-struct-val">${whenLabel}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Turnos</span>
            <span class="cat-struct-val">${shiftsLabel}</span>
          </div>
        </div>
      `;

      item.querySelector('.btn-edit-rec').addEventListener('click', () => {
        this._openEditRecurrenceModal(rec, categories);
      });

      item.querySelector('.btn-del-rec').addEventListener('click', () => {
        this._confirmDeleteRecurrence(rec);
      });

      listEl.appendChild(item);
    }
  }

  _openEditRecurrenceModal(rec, categories) {
    const isWeekly = rec.frequency === 'weekly';
    const form = document.createElement('form');
    form.className = 'form-grid';

    form.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="edit-rec-title">Nome do Bloco</label>
          <input class="input-control" id="edit-rec-title" type="text" required value="${this._escape(rec.title)}" />
        </div>
        <div class="field-group">
          <label class="field-label" for="edit-rec-cat">Categoria</label>
          <select class="input-control" id="edit-rec-cat">
            ${categories
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === rec.category_id ? 'selected' : ''}>${this._escape(c.name)}</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="edit-rec-freq">Frequência</label>
          <select class="input-control" id="edit-rec-freq">
            <option value="weekly" ${isWeekly ? 'selected' : ''}>Semanal (Dias da semana)</option>
            <option value="monthly" ${!isWeekly ? 'selected' : ''}>Mensal (Dia fixo do mês)</option>
          </select>
        </div>
        <div class="field-group" id="edit-rec-dom-group" style="display:${isWeekly ? 'none' : 'flex'};">
          <label class="field-label" for="edit-rec-dom">Dia do Mês (1 a 31)</label>
          <input class="input-control" id="edit-rec-dom" type="number" min="1" max="31" value="${rec.day_of_month || 1}" />
        </div>
      </div>

      <div class="field-group" id="edit-rec-dow-group" style="display:${isWeekly ? 'flex' : 'none'};">
        <span class="field-label">Dias da Semana</span>
        <div class="checkbox-pills" id="edit-rec-dow-pills">
          ${DAYS_PT.map(
            (name, idx) =>
              `<button type="button" class="pill-toggle ${(rec.days_of_week || []).includes(idx) ? 'selected' : ''}" data-dow="${idx}">${name}</button>`
          ).join('')}
        </div>
      </div>

      <div class="field-group">
        <span class="field-label">Turnos Aplicados</span>
        <div class="checkbox-pills" id="edit-rec-shift-pills">
          ${SHIFT_ORDER.map((sId) => {
            const s = SHIFTS[sId.toUpperCase()];
            const selected = (rec.shifts || []).includes(sId);
            return `<button type="button" class="pill-toggle ${selected ? 'selected' : ''}" data-shift="${sId}">${s.label}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="modal-footer-actions">
        <button type="button" class="btn btn-secondary" style="flex:1;" id="edit-rec-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">Salvar</button>
      </div>
    `;

    const freqSelect = form.querySelector('#edit-rec-freq');
    const dowGroup = form.querySelector('#edit-rec-dow-group');
    const domGroup = form.querySelector('#edit-rec-dom-group');

    freqSelect.addEventListener('change', () => {
      const weekly = freqSelect.value === 'weekly';
      dowGroup.style.display = weekly ? 'flex' : 'none';
      domGroup.style.display = weekly ? 'none' : 'flex';
    });

    form.querySelectorAll('.pill-toggle').forEach((pill) => {
      pill.addEventListener('click', () => pill.classList.toggle('selected'));
    });

    form.querySelector('#edit-rec-cancel').addEventListener('click', () => this.modal.close());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = form.querySelector('#edit-rec-title').value.trim();
      const category_id = form.querySelector('#edit-rec-cat').value;
      const frequency = freqSelect.value;
      const days_of_week = Array.from(form.querySelectorAll('#edit-rec-dow-pills .selected')).map(
        (el) => Number(el.dataset.dow)
      );
      const day_of_month = Number(form.querySelector('#edit-rec-dom').value);
      const shifts = Array.from(form.querySelectorAll('#edit-rec-shift-pills .selected')).map(
        (el) => el.dataset.shift
      );

      if (shifts.length === 0) {
        this.showToast('Selecione ao menos um turno.');
        return;
      }

      if (frequency === 'weekly' && days_of_week.length === 0) {
        this.showToast('Selecione ao menos um dia da semana.');
        return;
      }

      const updatedRec = createRecurrence({
        ...rec,
        title,
        category_id,
        frequency,
        days_of_week,
        day_of_month,
        shifts
      });

      await this.repo.saveRecurrence(updatedRec);

      const todayStr = toDateStr(new Date());
      const allEvents = await this.repo.getEvents();
      for (const ev of allEvents) {
        if (
          ev.recurrence_id === rec.id &&
          ev.date >= todayStr &&
          ev.status === EVENT_STATUS.PENDING &&
          !ev.manual_status_override
        ) {
          await this.repo.deleteEvent(ev.id);
        }
      }

      this.modal.close();
      this.showToast('Recorrência atualizada.');
      await this.onStateChange();
    });

    this.modal.open('Editar Recorrência', form);
  }

  _confirmDeleteRecurrence(rec) {
    const wrap = document.createElement('div');
    wrap.className = 'form-grid';
    wrap.innerHTML = `
      <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
        Deseja realmente remover a regra recorrente <strong>${this._escape(rec.title)}</strong> e todas as suas ocorrências futuras na agenda?
      </p>
      <div class="modal-footer-actions">
        <button type="button" class="btn btn-secondary" style="flex:1;" id="rec-del-cancel">Cancelar</button>
        <button type="button" class="btn btn-danger" style="flex:1;" id="rec-del-confirm">Remover</button>
      </div>
    `;

    wrap.querySelector('#rec-del-cancel').addEventListener('click', () => this.modal.close());
    wrap.querySelector('#rec-del-confirm').addEventListener('click', async () => {
      const snapshotRec = { ...rec };
      const allEvents = await this.repo.getEvents();
      const snapshotEvents = allEvents.filter((e) => e.recurrence_id === rec.id);

      await this.repo.deleteEventsByRecurrenceId(rec.id);
      await this.repo.deleteRecurrence(rec.id);
      this.modal.close();

      this.showToast('Recorrência removida.', 'Desfazer', async () => {
        await this.repo.saveRecurrence(snapshotRec);
        if (snapshotEvents.length > 0) await this.repo.saveEventsBulk(snapshotEvents);
        await this.onStateChange();
      });

      await this.onStateChange();
    });

    this.modal.open('Confirmar remoção de recorrência', wrap);
  }

  _bindForm() {
    const form = this.container.querySelector('#rec-form');
    const freqSelect = form.querySelector('#rec-freq');
    const dowGroup = form.querySelector('#rec-dow-group');
    const domGroup = form.querySelector('#rec-dom-group');

    freqSelect.addEventListener('change', () => {
      const isWeekly = freqSelect.value === 'weekly';
      dowGroup.style.display = isWeekly ? 'flex' : 'none';
      domGroup.style.display = isWeekly ? 'none' : 'flex';
    });

    form.querySelectorAll('.pill-toggle').forEach((pill) => {
      pill.addEventListener('click', () => pill.classList.toggle('selected'));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = form.querySelector('#rec-title').value;
      const category_id = form.querySelector('#rec-cat').value;
      const frequency = freqSelect.value;
      const days_of_week = Array.from(form.querySelectorAll('#rec-dow-pills .selected')).map((el) =>
        Number(el.dataset.dow)
      );
      const day_of_month = Number(form.querySelector('#rec-dom').value);
      const shifts = Array.from(form.querySelectorAll('#rec-shift-pills .selected')).map(
        (el) => el.dataset.shift
      );

      if (shifts.length === 0) {
        this.showToast('Selecione ao menos um turno.');
        return;
      }

      if (frequency === 'weekly' && days_of_week.length === 0) {
        this.showToast('Selecione ao menos um dia da semana.');
        return;
      }

      const rec = createRecurrence({
        title,
        category_id,
        frequency,
        days_of_week,
        day_of_month,
        shifts
      });

      await this.repo.saveRecurrence(rec);
      this.showToast('Regra recorrente criada.');
      await this.onStateChange();
    });
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
