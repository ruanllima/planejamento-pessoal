import { createCategory, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';

export class SettingsView {
  constructor({ container, repo, modal, onStateChange, showToast }) {
    this.container = container;
    this.repo = repo;
    this.modal = modal;
    this.onStateChange = onStateChange;
    this.showToast = showToast;
  }

  async render() {
    const [categories, settings] = await Promise.all([
      this.repo.getCategories(),
      this.repo.getSettings()
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Categorias e Ajustes</h1>
          <p class="view-subtitle">Hierarquia de sacrifício, restrições de turno e preferências</p>
        </div>
        <button type="button" class="btn btn-primary" id="btn-new-cat">+ Nova Categoria</button>
      </header>

      <div class="panel-card">
        <h2 class="field-label" style="margin-bottom:12px;">Preferências Globais</h2>
        <div class="form-grid form-grid-2">
          <div class="field-group">
            <span class="field-label">Modo de Tempo</span>
            <div class="segmented-control">
              <button type="button" class="seg-btn ${settings.time_mode === 'shifts' ? 'active' : ''}" data-tmode="shifts">Turnos</button>
              <button type="button" class="seg-btn ${settings.time_mode === '24h' ? 'active' : ''}" data-tmode="24h">Horário 24h</button>
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">Tema Visual</span>
            <div class="segmented-control">
              <button type="button" class="seg-btn ${settings.theme === 'dark' ? 'active' : ''}" data-theme-opt="dark">Dark Mode</button>
              <button type="button" class="seg-btn ${settings.theme === 'light' ? 'active' : ''}" data-theme-opt="light">Light Mode</button>
            </div>
          </div>
        </div>
      </div>

      <h2 class="field-label" style="margin-bottom:10px;">Categorias e Hierarquia de Substituição</h2>
      <div class="log-list" id="cat-list"></div>

      <div class="panel-card" style="margin-top:20px;">
        <h2 class="field-label" style="margin-bottom:12px;">Portabilidade e Dados</h2>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <button type="button" class="btn btn-secondary" id="btn-export">Exportar Backup JSON</button>
          <label class="btn btn-secondary" style="cursor:pointer;">
            Importar JSON
            <input type="file" id="input-import" accept=".json" class="hidden" />
          </label>
          <button type="button" class="btn btn-danger" id="btn-clear-all">Limpar Tudo (1 Clique)</button>
        </div>
      </div>
    `;

    this._bindGlobalControls(categories);

    const catListEl = this.container.querySelector('#cat-list');
    for (const cat of categories) {
      const allowedStr = cat.allowed_shifts.map((s) => SHIFTS[s.toUpperCase()].label).join(', ');
      const priorityStr =
        cat.substitution_priority.length > 0
          ? cat.substitution_priority
              .map((id) => catMap.get(id)?.name)
              .filter(Boolean)
              .join(', ')
          : 'Nenhum (não desloca outras categorias)';

      const card = document.createElement('div');
      card.className = 'cat-struct-card';
      card.style.setProperty('--cat-color', cat.color);
      card.innerHTML = `
        <div class="cat-struct-top">
          <span class="cat-struct-title">${this._escape(cat.name)}</span>
          <button type="button" class="btn btn-secondary btn-edit-cat">Configurar</button>
        </div>
        <div class="cat-struct-rows">
          <div class="cat-struct-row">
            <span class="cat-struct-key">Meta semanal</span>
            <span class="cat-struct-val">${cat.weekly_goal ? `${cat.weekly_goal} turnos` : 'Livre'}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Turnos permitidos</span>
            <span class="cat-struct-val">${allowedStr}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Alvos de troca</span>
            <span class="cat-struct-val">${this._escape(priorityStr)}</span>
          </div>
        </div>
      `;

      card.querySelector('.btn-edit-cat').addEventListener('click', () => {
        this._openCategoryModal(cat, categories);
      });

      catListEl.appendChild(card);
    }
  }

  _bindGlobalControls(categories) {
    this.container.querySelectorAll('[data-tmode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.repo.saveSettings({ time_mode: btn.dataset.tmode });
        await this.onStateChange();
      });
    });

    this.container.querySelectorAll('[data-theme-opt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.themeOpt;
        document.documentElement.setAttribute('data-theme', theme);
        await this.repo.saveSettings({ theme });
        await this.onStateChange();
      });
    });

    this.container.querySelector('#btn-new-cat').addEventListener('click', () => {
      this._openCategoryModal(null, categories);
    });

    this.container.querySelector('#btn-export').addEventListener('click', async () => {
      const payload = await this.repo.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chronosshift-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    this.container.querySelector('#input-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await this.repo.importAll(JSON.parse(text));
        this.showToast('Backup importado com sucesso.');
        await this.onStateChange();
      } catch (err) {
        this.showToast('Erro ao importar JSON.');
      }
    });

    this.container.querySelector('#btn-clear-all').addEventListener('click', async () => {
      await this.repo.clearAll();
      this.showToast('Todos os dados foram limpos.');
      await this.onStateChange();
    });
  }

  _openCategoryModal(catDraft, allCategories) {
    const isEdit = Boolean(catDraft);
    const draft = catDraft || createCategory({ name: '', color: '#3B82F6' });
    const otherCats = allCategories.filter((c) => c.id !== draft.id);

    let priorityIds = [...draft.substitution_priority].filter((id) =>
      otherCats.some((c) => c.id === id)
    );

    const form = document.createElement('form');
    form.className = 'form-grid';

    const renderPriorityEditor = () => {
      const listContainer = form.querySelector('#prio-editor');
      const availableToAdd = otherCats.filter((c) => !priorityIds.includes(c.id));

      listContainer.innerHTML = `
        <div class="priority-list">
          ${priorityIds
            .map((id, idx) => {
              const target = otherCats.find((c) => c.id === id);
              return `
                <div class="priority-item">
                  <span>${this._escape(target.name)}</span>
                  <div class="priority-controls">
                    <button type="button" class="btn-icon btn-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-icon btn-down" data-idx="${idx}" ${idx === priorityIds.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" class="btn-icon btn-rm" data-idx="${idx}">✕</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        ${
          availableToAdd.length > 0
            ? `
          <div style="display:flex; gap:6px; margin-top:8px;">
            <select class="input-control" id="add-prio-select">
              ${availableToAdd.map((c) => `<option value="${c.id}">${this._escape(c.name)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" id="btn-add-prio">+ Adicionar</button>
          </div>`
            : ''
        }
      `;

      listContainer.querySelectorAll('.btn-up').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.idx);
          [priorityIds[i - 1], priorityIds[i]] = [priorityIds[i], priorityIds[i - 1]];
          renderPriorityEditor();
        })
      );
      listContainer.querySelectorAll('.btn-down').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.idx);
          [priorityIds[i + 1], priorityIds[i]] = [priorityIds[i], priorityIds[i + 1]];
          renderPriorityEditor();
        })
      );
      listContainer.querySelectorAll('.btn-rm').forEach((b) =>
        b.addEventListener('click', () => {
          priorityIds.splice(Number(b.dataset.idx), 1);
          renderPriorityEditor();
        })
      );
      const addBtn = listContainer.querySelector('#btn-add-prio');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const sel = listContainer.querySelector('#add-prio-select').value;
          if (sel) {
            priorityIds.push(sel);
            renderPriorityEditor();
          }
        });
      }
    };

    form.innerHTML = `
      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="cat-name">Nome da Categoria</label>
          <input class="input-control" id="cat-name" type="text" required value="${this._escape(draft.name)}" placeholder="Ex: Academia" />
        </div>
        <div class="field-group">
          <label class="field-label" for="cat-color">Cor</label>
          <input class="input-control" id="cat-color" type="color" value="${draft.color}" style="height:42px; padding:4px;" />
        </div>
      </div>

      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="cat-goal">Meta Semanal de Turnos</label>
          <input class="input-control" id="cat-goal" type="number" min="1" max="21" value="${draft.weekly_goal || ''}" placeholder="Opcional" />
        </div>
        <div class="field-group">
          <label class="field-label" for="cat-comp">Compensação Automática</label>
          <select class="input-control" id="cat-comp">
            <option value="true" ${draft.is_compensable ? 'selected' : ''}>Ativada</option>
            <option value="false" ${!draft.is_compensable ? 'selected' : ''}>Desativada</option>
          </select>
        </div>
      </div>

      <div class="field-group">
        <span class="field-label">Turnos Permitidos</span>
        <div class="checkbox-pills" id="cat-shifts">
          ${SHIFT_ORDER.map((sId) => {
            const s = SHIFTS[sId.toUpperCase()];
            const active = draft.allowed_shifts.includes(sId);
            return `<button type="button" class="pill-toggle ${active ? 'selected' : ''}" data-shift="${sId}">${s.label}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="field-group">
        <span class="field-label">Alvos de Substituição (Ordem de prioridade)</span>
        <div id="prio-editor"></div>
      </div>

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="submit" class="btn btn-primary" style="flex:1;">Salvar Categoria</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-cat">Excluir</button>` : ''}
      </div>
    `;

    form.querySelectorAll('#cat-shifts .pill-toggle').forEach((p) =>
      p.addEventListener('click', () => p.classList.toggle('selected'))
    );

    renderPriorityEditor();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const allowed_shifts = Array.from(form.querySelectorAll('#cat-shifts .selected')).map(
        (el) => el.dataset.shift
      );
      if (allowed_shifts.length === 0) {
        this.showToast('Selecione ao menos 1 turno permitido.');
        return;
      }

      const saved = createCategory({
        ...draft,
        name: form.querySelector('#cat-name').value,
        color: form.querySelector('#cat-color').value,
        weekly_goal: form.querySelector('#cat-goal').value || null,
        is_compensable: form.querySelector('#cat-comp').value === 'true',
        allowed_shifts,
        substitution_priority: priorityIds
      });

      await this.repo.saveCategory(saved);
      this.modal.close();
      this.showToast('Categoria salva.');
      await this.onStateChange();
    });

    if (isEdit) {
      form.querySelector('#btn-del-cat').addEventListener('click', async () => {
        await this.repo.deleteCategory(draft.id);
        this.modal.close();
        this.showToast('Categoria excluída.');
        await this.onStateChange();
      });
    }

    this.modal.open(isEdit ? `Configurar: ${draft.name}` : 'Nova Categoria', form);
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
