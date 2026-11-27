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

    const globalCategories = categories.filter((c) => Boolean(c.in_global_list));
    const availableForGlobal = categories.filter((c) => !c.in_global_list);

    this.container.innerHTML = `
      <header class="view-header">
        <div>
          <h1 class="view-title">Categorias e Ajustes</h1>
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
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
          <h2 class="field-label" style="margin:0;">Hierarquia de Realocação</h2>
          ${
            availableForGlobal.length > 0
              ? `<button type="button" class="btn-icon" id="btn-add-to-global" title="Adicionar categoria à lista global" aria-label="Adicionar categoria à lista global">+</button>`
              : ''
          }
        </div>
        <div class="priority-list" id="global-priority-list">
          <div class="priority-item" style="opacity:0.75;">
            <span><strong>1.</strong> Turno vazio (none)</span>
            <span style="font-size:0.72rem; color:var(--text-muted);">Primeiro alvo</span>
          </div>
          ${globalCategories
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
                  <button type="button" class="btn-icon btn-global-down" data-idx="${idx}" ${idx === globalCategories.length - 1 ? 'disabled' : ''} aria-label="Aumentar peso">↓</button>
                  <button type="button" class="btn-icon btn-global-remove" data-cat-id="${cat.id}" title="Remover da lista global" aria-label="Remover da lista global">×</button>
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

    this._bindGlobalControls(categories, globalCategories, availableForGlobal);

    const catListEl = this.container.querySelector('#cat-list');
    for (const cat of categories) {
      const allowedStr = cat.allowed_shifts.map((s) => SHIFTS[s.toUpperCase()].label).join(', ');
      const relocatableStr = cat.is_relocatable ? 'Sim' : 'Não';

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
            <span class="cat-struct-key">Realocação automática</span>
            <div class="cat-rule-pills" style="margin-top:2px;">
              <span class="cat-rule-pill">Realocável: ${relocatableStr}</span>
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

  _bindGlobalControls(categories, globalCategories, availableForGlobal) {
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

    const addGlobalBtn = this.container.querySelector('#btn-add-to-global');
    if (addGlobalBtn) {
      addGlobalBtn.addEventListener('click', () => {
        this._openAddToGlobalModal(categories, availableForGlobal);
      });
    }

    this.container.querySelectorAll('.btn-global-up').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const reorderedGlobal = [...globalCategories];
        [reorderedGlobal[idx - 1], reorderedGlobal[idx]] = [reorderedGlobal[idx], reorderedGlobal[idx - 1]];
        const nonGlobal = categories.filter((c) => !c.in_global_list);
        const merged = [...reorderedGlobal, ...nonGlobal].map((c, i) => ({
          ...c,
          priority_order: i
        }));
        await this.repo.saveCategoriesBulk(merged);
        await this.onStateChange();
      });
    });

    this.container.querySelectorAll('.btn-global-down').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.idx);
        const reorderedGlobal = [...globalCategories];
        [reorderedGlobal[idx + 1], reorderedGlobal[idx]] = [reorderedGlobal[idx], reorderedGlobal[idx + 1]];
        const nonGlobal = categories.filter((c) => !c.in_global_list);
        const merged = [...reorderedGlobal, ...nonGlobal].map((c, i) => ({
          ...c,
          priority_order: i
        }));
        await this.repo.saveCategoriesBulk(merged);
        await this.onStateChange();
      });
    });

    this.container.querySelectorAll('.btn-global-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const catId = btn.dataset.catId;
        const updated = categories.map((c) =>
          c.id === catId ? { ...c, in_global_list: false } : c
        );
        await this.repo.saveCategoriesBulk(updated);
        this.showToast('Removida da lista global.');
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
        <div class="modal-footer-actions">
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

  _openAddToGlobalModal(allCategories, availableForGlobal) {
    const wrap = document.createElement('div');
    wrap.className = 'form-grid';
    wrap.innerHTML = `
      <p style="font-size:0.84rem; color:var(--text-secondary);">
        Selecione uma categoria para incluí-la na Lista Global (permitindo que seja substituída quando necessário):
      </p>
      <div class="priority-list">
        ${availableForGlobal
          .map(
            (cat) => `
            <button type="button" class="priority-item" data-pick-id="${cat.id}" style="width:100%; text-align:left; cursor:pointer;">
              <span style="display:inline-flex; align-items:center; gap:8px;">
                <span class="cat-dot" style="--cat-color:${cat.color};"></span>
                <span>${this._escape(cat.name)}</span>
              </span>
              <span style="font-size:0.75rem; color:var(--text-muted);">+ Adicionar</span>
            </button>
          `
          )
          .join('')}
      </div>
    `;

    wrap.querySelectorAll('[data-pick-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pickedId = btn.dataset.pickId;
        const globalList = allCategories.filter((c) => c.in_global_list);
        const pickedCat = allCategories.find((c) => c.id === pickedId);
        if (!pickedCat) return;

        const newGlobal = [...globalList, { ...pickedCat, in_global_list: true }];
        const remainingNonGlobal = allCategories.filter(
          (c) => !c.in_global_list && c.id !== pickedId
        );
        const merged = [...newGlobal, ...remainingNonGlobal].map((c, idx) => ({
          ...c,
          priority_order: idx
        }));

        await this.repo.saveCategoriesBulk(merged);
        this.modal.close();
        this.showToast(`"${pickedCat.name}" adicionada à lista global.`);
        await this.onStateChange();
      });
    });

    this.modal.open('Adicionar à Lista Global', wrap);
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
        in_global_list: false
      });

    const initialGoal = draft.weekly_goal ? Number(draft.weekly_goal) : 0;

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

      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="cat-goal">Meta Semanal de Turnos</label>
          <div class="number-stepper">
            <button type="button" class="stepper-btn" id="goal-dec" aria-label="Diminuir meta">−</button>
            <input
              class="stepper-input"
              id="cat-goal"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              value="${initialGoal}"
              aria-label="Meta semanal de turnos"
            />
            <button type="button" class="stepper-btn" id="goal-inc" aria-label="Aumentar meta">+</button>
          </div>
          <span style="font-size:0.72rem; color:var(--text-muted);">0 = sem meta semanal</span>
        </div>

        <div class="field-group">
          <label class="field-label" for="cat-reloc">Realocável automaticamente</label>
          <select class="input-control" id="cat-reloc">
            <option value="true" ${draft.is_relocatable ? 'selected' : ''}>Sim</option>
            <option value="false" ${!draft.is_relocatable ? 'selected' : ''}>Não</option>
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

      <div class="modal-footer-actions">
        <button type="submit" class="btn btn-primary" style="flex:1;">Salvar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-cat">Excluir</button>` : ''}
      </div>
    `;

    const goalInput = form.querySelector('#cat-goal');
    const clampGoal = (n) => Math.max(0, Math.min(21, n));

    goalInput.addEventListener('input', () => {
      const digitsOnly = goalInput.value.replace(/[^0-9]/g, '');
      if (digitsOnly === '') {
        goalInput.value = '';
        return;
      }
      goalInput.value = String(clampGoal(parseInt(digitsOnly, 10)));
    });

    goalInput.addEventListener('blur', () => {
      if (goalInput.value.trim() === '') {
        goalInput.value = '0';
      }
    });

    form.querySelector('#goal-dec').addEventListener('click', () => {
      const cur = parseInt(goalInput.value || '0', 10) || 0;
      goalInput.value = String(clampGoal(cur - 1));
    });

    form.querySelector('#goal-inc').addEventListener('click', () => {
      const cur = parseInt(goalInput.value || '0', 10) || 0;
      goalInput.value = String(clampGoal(cur + 1));
    });

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

      const rawGoal = parseInt(goalInput.value || '0', 10) || 0;
      const weekly_goal = rawGoal > 0 ? rawGoal : null;

      const saved = createCategory({
        ...draft,
        name: form.querySelector('#cat-name').value,
        color: form.querySelector('#cat-color').value,
        weekly_goal,
        is_relocatable: form.querySelector('#cat-reloc').value === 'true',
        in_global_list: isEdit ? Boolean(draft.in_global_list) : false,
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
          <div class="modal-footer-actions">
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
