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

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Categorias e Ajustes</h1>
          <p class="view-subtitle">Lista global de prioridade, turnos permitidos e regras de realocação</p>
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

      <div class="panel-card">
        <h2 class="field-label" style="margin-bottom:4px;">Lista Global de Busca e Prioridade</h2>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">
          Ordem de busca ao realocar (do menor peso para o maior). A busca começa por turnos vazios e para ao atingir a própria categoria.
        </p>
        <div class="priority-list" id="global-priority-list">
          <div class="priority-item" style="opacity:0.75;">
            <span><strong>1.</strong> Turno vazio (none)</span>
            <span style="font-size:0.72rem; color:var(--text-muted);">Primeiro alvo</span>
          </div>
          ${categories
            .map(
              (cat, idx) => `
              <div class="priority-item">
                <span style="display:inline-flex; align-items:center; gap:8px;">
                  <strong>${idx + 2}.</strong>
                  <span class="cat-dot" style="--cat-color:${cat.color};"></span>
                  <span>${this._escape(cat.name)}</span>
                </span>
                <div class="priority-controls">
                  <button type="button" class="btn-icon btn-global-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="Diminuir peso">↑</button>
                  <button type="button" class="btn-icon btn-global-down" data-idx="${idx}" ${idx === categories.length - 1 ? 'disabled' : ''} aria-label="Aumentar peso">↓</button>
                </div>
              </div>
            `
            )
            .join('')}
        </div>
      </div>

      <h2 class="field-label" style="margin-bottom:10px;">Categorias (${categories.length})</h2>
      <div class="log-list" id="cat-list"></div>

      <div class="panel-card" style="margin-top:20px;">
        <h2 class="field-label" style="margin-bottom:12px;">Portabilidade e Dados</h2>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <button type="button" class="btn btn-secondary" id="btn-export">Exportar Backup JSON</button>
          <label class="btn btn-secondary" style="cursor:pointer;">
            Importar JSON
            <input type="file" id="input-import" accept=".json" class="hidden" />
          </label>
          <button type="button" class="btn btn-danger" id="btn-clear-all">Limpar Tudo</button>
        </div>
      </div>
    `;

    this._bindGlobalControls(categories);

    const catListEl = this.container.querySelector('#cat-list');
    for (const cat of categories) {
      const allowedStr = cat.allowed_shifts.map((s) => SHIFTS[s.toUpperCase()].label).join(', ');
      const relocatableStr = cat.is_relocatable ? 'Sim' : 'Não';
      const sacrificeableStr = cat.is_sacrificeable ? 'Sim' : 'Não';

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
            <span class="cat-struct-val">${cat.weekly_goal ? `${cat.weekly_goal} turnos` : 'Sem meta'}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Turnos permitidos</span>
            <span class="cat-struct-val">${allowedStr}</span>
          </div>
          <div class="cat-struct-row">
            <span class="cat-struct-key">Regras de realocação</span>
            <div class="cat-rule-pills" style="margin-top:2px;">
              <span class="cat-rule-pill">Realocável: ${relocatableStr}</span>
              <span class="cat-rule-pill">Sacrificável: ${sacrificeableStr}</span>
            </div>
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

    this.container.querySelectorAll('.btn-global-up').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const reordered = [...categories];
        [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
        const updated = reordered.map((c, i) => ({ ...c, priority_order: i }));
        await this.repo.saveCategoriesBulk(updated);
        await this.onStateChange();
      });
    });

    this.container.querySelectorAll('.btn-global-down').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const reordered = [...categories];
        [reordered[idx + 1], reordered[idx]] = [reordered[idx], reordered[idx + 1]];
        const updated = reordered.map((c, i) => ({ ...c, priority_order: i }));
        await this.repo.saveCategoriesBulk(updated);
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

    this.container.querySelector('#btn-clear-all').addEventListener('click', () => {
      const wrap = document.createElement('div');
      wrap.className = 'form-grid';
      wrap.innerHTML = `
        <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
          Tem certeza que deseja limpar <strong>todos os compromissos, categorias, recorrências e histórico</strong>?
        </p>
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button type="button" class="btn btn-secondary" style="flex:1;" id="clear-cancel">Cancelar</button>
          <button type="button" class="btn btn-danger" style="flex:1;" id="clear-confirm">Limpar Tudo</button>
        </div>
      `;

      wrap.querySelector('#clear-cancel').addEventListener('click', () => this.modal.close());
      wrap.querySelector('#clear-confirm').addEventListener('click', async () => {
        const snapshotBackup = await this.repo.exportAll();
        await this.repo.clearAll();
        this.modal.close();

        this.showToast('Todos os dados foram limpos.', 'Desfazer', async () => {
          await this.repo.importAll(snapshotBackup);
          await this.onStateChange();
        });

        await this.onStateChange();
      });

      this.modal.open('Confirmar limpeza total', wrap);
    });
  }

  _openCategoryModal(catDraft, allCategories) {
    const isEdit = Boolean(catDraft);
    const draft =
      catDraft ||
      createCategory({
        name: '',
        color: '#3B82F6',
        priority_order: allCategories.length,
        is_relocatable: true,
        is_sacrificeable: true
      });

    const form = document.createElement('form');
    form.className = 'form-grid';

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

      <div class="field-group">
        <label class="field-label" for="cat-goal">Meta Semanal de Turnos (Opcional)</label>
        <input class="input-control" id="cat-goal" type="number" min="1" max="21" value="${draft.weekly_goal || ''}" placeholder="Sem meta" />
      </div>

      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="cat-reloc">Realocável automaticamente</label>
          <select class="input-control" id="cat-reloc">
            <option value="true" ${draft.is_relocatable ? 'selected' : ''}>Sim</option>
            <option value="false" ${!draft.is_relocatable ? 'selected' : ''}>Não</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="cat-sac">Sacrificável automaticamente</label>
          <select class="input-control" id="cat-sac">
            <option value="true" ${draft.is_sacrificeable ? 'selected' : ''}>Sim</option>
            <option value="false" ${!draft.is_sacrificeable ? 'selected' : ''}>Não</option>
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

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="submit" class="btn btn-primary" style="flex:1;">Salvar Categoria</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-cat">Excluir</button>` : ''}
      </div>
    `;

    form.querySelectorAll('#cat-shifts .pill-toggle').forEach((p) =>
      p.addEventListener('click', () => p.classList.toggle('selected'))
    );

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
        is_relocatable: form.querySelector('#cat-reloc').value === 'true',
        is_sacrificeable: form.querySelector('#cat-sac').value === 'true',
        allowed_shifts
      });

      await this.repo.saveCategory(saved);
      this.modal.close();
      this.showToast('Categoria salva.');
      await this.onStateChange();
    });

    if (isEdit) {
      form.querySelector('#btn-del-cat').addEventListener('click', () => {
        const confirmWrap = document.createElement('div');
        confirmWrap.className = 'form-grid';
        confirmWrap.innerHTML = `
          <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
            Deseja realmente excluir a categoria <strong>${this._escape(draft.name)}</strong>?
          </p>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button type="button" class="btn btn-secondary" style="flex:1;" id="cat-del-cancel">Cancelar</button>
            <button type="button" class="btn btn-danger" style="flex:1;" id="cat-del-confirm">Excluir</button>
          </div>
        `;

        confirmWrap.querySelector('#cat-del-cancel').addEventListener('click', () => {
          this._openCategoryModal(draft, allCategories);
        });

        confirmWrap.querySelector('#cat-del-confirm').addEventListener('click', async () => {
          const snapshotCat = { ...draft };
          await this.repo.deleteCategory(draft.id);
          this.modal.close();

          this.showToast(`Categoria "${snapshotCat.name}" excluída.`, 'Desfazer', async () => {
            await this.repo.saveCategory(snapshotCat);
            await this.onStateChange();
          });

          await this.onStateChange();
        });

        this.modal.open('Confirmar exclusão de categoria', confirmWrap);
      });
    }

    this.modal.open(isEdit ? `Configurar: ${draft.name}` : 'Nova Categoria', form);
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
