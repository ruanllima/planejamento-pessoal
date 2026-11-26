import { createRecurrence, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export class RecurrencesView {
  constructor({ container, repo, onStateChange, showToast }) {
    this.container = container;
    this.repo = repo;
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
              <label class="field-label" for="rec-dom">Dia do Mês (1–31)</label>
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

          <button type="submit" class="btn btn-primary">Salvar Regra Recorrente</button>
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
      const shiftsLabel = rec.shifts.map((s) => SHIFTS[s.toUpperCase()].label).join(' + ');

      const item = document.createElement('div');
      item.className = 'panel-card';
      item.style.marginBottom = '0';
      item.style.borderLeft = `4px solid ${cat ? cat.color : '#64748B'}`;
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="font-weight:700;">${this._escape(rec.title)}</div>
            <div style="font-size:0.78rem; color:var(--text-secondary);">
              ${cat ? cat.name : ''} • ${whenLabel} • ${shiftsLabel}
            </div>
          </div>
          <button type="button" class="btn btn-danger btn-del-rec">Remover</button>
        </div>
      `;

      item.querySelector('.btn-del-rec').addEventListener('click', async () => {
        await this.repo.deleteRecurrence(rec.id);
        this.showToast('Recorrência removida.');
        await this.onStateChange();
      });

      listEl.appendChild(item);
    }
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

      const rec = createRecurrence({
        title,
        category_id,
        frequency,
        days_of_week,
        day_of_month,
        shifts
      });

      await this.repo.saveRecurrence(rec);
      this.showToast('Regra recorrente criada!');
      await this.onStateChange();
    });
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
