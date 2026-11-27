import { createCategory, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';
import { sanitizeHexColor } from '../domain/DateUtils.js';

export const CATEGORY_COLOR_PALETTE = Object.freeze([
  '#16A34A', '#22C55E', '#34D399', '#3B82F6',
  '#2563EB', '#7C3AED', '#EC4899', '#DC2626',
  '#86EFAC', '#A7F3D0', '#BFDBFE', '#93C5FD',
  '#C4B5FD', '#F0ABFC', '#F9A8D4', '#FCA5A5'
]);

function hexToHsv(hex) {
  const clean = sanitizeHexColor(hex, '#3B82F6').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: Math.round(h * 360), s, v };
}

function hsvToHex(h, s, v) {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hue < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

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
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
          <h2 class="field-label" style="margin:0;">Lista Global de Busca e Prioridade</h2>
          ${
            availableForGlobal.length > 0
              ? `<button type="button" class="btn-icon" id="btn-add-to-global" title="Adicionar categoria à lista global" aria-label="Adicionar categoria à lista global">+</button>`
              : ''
          }
        </div>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">
          Apenas categorias nesta lista podem ser substituídas ao realocar (do menor peso para o maior). Categorias fora da lista não são sacrificáveis.
        </p>
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
                  <span class="cat-dot" style="--cat-color:${sanitizeHexColor(cat.color)};"></span>
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
      card.style.setProperty('--cat-color', sanitizeHexColor(cat.color));
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
                <span class="cat-dot" style="--cat-color:${sanitizeHexColor(cat.color)};"></span>
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

    const initialColor = sanitizeHexColor(draft.color, '#3B82F6').toUpperCase();
    const initialGoal = draft.weekly_goal ? Number(draft.weekly_goal) : 0;

    const form = document.createElement('form');
    form.className = 'form-grid';

    form.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="cat-name">Nome da Categoria</label>
        <input class="input-control" id="cat-name" type="text" required value="${this._escape(draft.name)}" placeholder="Ex: Academia" />
      </div>

      <div class="field-group">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <label class="field-label" for="cat-color-hex" style="margin:0;">Cor da Categoria</label>
          <span class="color-preview-pill" id="cat-color-badge">
            <span class="color-preview-dot" id="cat-color-dot" style="background:${initialColor};"></span>
            <code id="cat-color-code">${initialColor}</code>
          </span>
        </div>

        <input type="hidden" id="cat-color" value="${initialColor}" />

        <div class="color-swatch-grid-4x4" id="cat-swatch-grid" role="radiogroup" aria-label="Paleta padrão de cores">
          ${CATEGORY_COLOR_PALETTE.map((hex) => {
            const selected = hex.toUpperCase() === initialColor;
            return `
              <button
                type="button"
                class="color-swatch-tile ${selected ? 'selected' : ''}"
                data-color="${hex}"
                style="--tile-color:${hex};"
                role="radio"
                aria-checked="${selected}"
                aria-label="Cor ${hex}"
                title="${hex}"
              ></button>
            `;
          }).join('')}
        </div>

        <button
          type="button"
          class="custom-color-toggle-btn"
          id="btn-toggle-custom-color"
          aria-expanded="false"
          aria-controls="universal-color-picker"
        >
          <span class="custom-color-toggle-left">
            <span class="custom-color-wheel-icon" aria-hidden="true"></span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
            <span>Cor personalizada</span>
          </span>
          <span class="custom-color-chevron" aria-hidden="true">▾</span>
        </button>

        <div class="universal-color-picker hidden" id="universal-color-picker">
          <div class="ucp-sv-board" id="ucp-sv-board" role="slider" tabindex="0" aria-label="Saturação e brilho da cor">
            <div class="ucp-sv-white"></div>
            <div class="ucp-sv-black"></div>
            <span class="ucp-sv-thumb" id="ucp-sv-thumb"></span>
          </div>
          <div class="ucp-controls-row">
            <input
              type="range"
              class="ucp-hue-slider"
              id="ucp-hue-slider"
              min="0"
              max="359"
              value="217"
              aria-label="Matiz (Hue)"
            />
            <input
              type="text"
              class="input-control ucp-hex-input"
              id="cat-color-hex"
              maxlength="7"
              value="${initialColor}"
              aria-label="Código hexadecimal da cor"
              placeholder="#3B82F6"
            />
          </div>
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

    this._bindColorPicker(form, initialColor);

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
      const chosenColor = sanitizeHexColor(form.querySelector('#cat-color').value, '#3B82F6').toUpperCase();

      const saved = createCategory({
        ...draft,
        name: form.querySelector('#cat-name').value,
        color: chosenColor,
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

  _bindColorPicker(form, initialColor) {
    const hiddenInput = form.querySelector('#cat-color');
    const hexInput = form.querySelector('#cat-color-hex');
    const colorDot = form.querySelector('#cat-color-dot');
    const colorCode = form.querySelector('#cat-color-code');
    const svBoard = form.querySelector('#ucp-sv-board');
    const svThumb = form.querySelector('#ucp-sv-thumb');
    const hueSlider = form.querySelector('#ucp-hue-slider');
    const swatchTiles = Array.from(form.querySelectorAll('.color-swatch-tile'));

    let hsv = hexToHsv(initialColor);

    const syncUI = (hexValue, { updateHueSlider = true, updateHexInput = true } = {}) => {
      const normalized = sanitizeHexColor(hexValue, '#3B82F6').toUpperCase();
      hiddenInput.value = normalized;
      colorDot.style.background = normalized;
      colorCode.textContent = normalized;
      if (updateHexInput) hexInput.value = normalized;

      svBoard.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
      svThumb.style.left = `${Math.round(hsv.s * 100)}%`;
      svThumb.style.top = `${Math.round((1 - hsv.v) * 100)}%`;
      svThumb.style.backgroundColor = normalized;

      if (updateHueSlider) {
        hueSlider.value = String(hsv.h);
      }

      swatchTiles.forEach((tile) => {
        const isMatch = tile.dataset.color.toUpperCase() === normalized;
        tile.classList.toggle('selected', isMatch);
        tile.setAttribute('aria-checked', String(isMatch));
      });
    };

    syncUI(initialColor);

    swatchTiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const picked = tile.dataset.color.toUpperCase();
        hsv = hexToHsv(picked);
        syncUI(picked);
      });
    });

    hueSlider.addEventListener('input', () => {
      hsv.h = Number(hueSlider.value) || 0;
      const nextHex = hsvToHex(hsv.h, hsv.s, hsv.v);
      syncUI(nextHex, { updateHueSlider: false });
    });

    const updateFromBoardPointer = (clientX, clientY) => {
      const rect = svBoard.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      hsv.s = clampedX / rect.width;
      hsv.v = 1 - clampedY / rect.height;
      const nextHex = hsvToHex(hsv.h, hsv.s, hsv.v);
      syncUI(nextHex, { updateHueSlider: false });
    };

    let draggingBoard = false;
    svBoard.addEventListener('pointerdown', (e) => {
      draggingBoard = true;
      svBoard.setPointerCapture(e.pointerId);
      updateFromBoardPointer(e.clientX, e.clientY);
    });
    svBoard.addEventListener('pointermove', (e) => {
      if (!draggingBoard) return;
      updateFromBoardPointer(e.clientX, e.clientY);
    });
    const stopBoardDrag = () => { draggingBoard = false; };
    svBoard.addEventListener('pointerup', stopBoardDrag);
    svBoard.addEventListener('pointercancel', stopBoardDrag);

    svBoard.addEventListener('keydown', (e) => {
      const step = 0.05;
      if (e.key === 'ArrowRight') hsv.s = Math.min(1, hsv.s + step);
      else if (e.key === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - step);
      else if (e.key === 'ArrowUp') hsv.v = Math.min(1, hsv.v + step);
      else if (e.key === 'ArrowDown') hsv.v = Math.max(0, hsv.v - step);
      else return;
      e.preventDefault();
      syncUI(hsvToHex(hsv.h, hsv.s, hsv.v), { updateHueSlider: false });
    });

    hexInput.addEventListener('input', () => {
      let raw = hexInput.value.trim();
      if (raw && !raw.startsWith('#')) raw = `#${raw}`;
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
        const normalized = sanitizeHexColor(raw).toUpperCase();
        hsv = hexToHsv(normalized);
        syncUI(normalized, { updateHexInput: false });
      }
    });

    hexInput.addEventListener('blur', () => {
      hexInput.value = hiddenInput.value;
    });

    const toggleCustomBtn = form.querySelector('#btn-toggle-custom-color');
    const universalPicker = form.querySelector('#universal-color-picker');
    const isCustomInitial = !CATEGORY_COLOR_PALETTE.some(
      (hex) => hex.toUpperCase() === initialColor
    );

    const setCustomPickerOpen = (open) => {
      universalPicker.classList.toggle('hidden', !open);
      toggleCustomBtn.classList.toggle('active', open);
      toggleCustomBtn.setAttribute('aria-expanded', String(open));
    };

    if (isCustomInitial) {
      setCustomPickerOpen(true);
    }

    toggleCustomBtn.addEventListener('click', () => {
      const willOpen = universalPicker.classList.contains('hidden');
      setCustomPickerOpen(willOpen);
    });
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
