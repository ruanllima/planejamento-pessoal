const AppController = {
  pendingDeleteEvent: null,

  init() {
    AppState.init();
    CompensationEngine.runShiftAutoCheck();
    this.bindEvents();
    UIRenderer.renderAll();

    // Checagem periódica de virada de turno (06:00, 12:00, 18:00)
    setInterval(() => {
      CompensationEngine.runShiftAutoCheck();
      UIRenderer.renderAll();
    }, 60 * 1000);
  },

  bindEvents() {
    // Alternância Dia / Semana / Mês
    document.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        AppState.currentView = btn.dataset.view;
        UIRenderer.renderAll();
      });
    });

    // Navegação Anterior / Próximo / Hoje
    document.getElementById('btn-prev').addEventListener('click', () => this.navigate(-1));
    document.getElementById('btn-next').addEventListener('click', () => this.navigate(1));
    document.getElementById('btn-today').addEventListener('click', () => {
      AppState.anchorDate = new Date();
      UIRenderer.renderAll();
    });

    // Novo Compromisso
    document.getElementById('btn-new-event').addEventListener('click', () => this.openCreateModal());

    // Salvar Formulário
    document.getElementById('form-event').addEventListener('submit', e => {
      e.preventDefault();
      this.saveEventFromForm();
    });

    // Botão Excluir no Modal de Edição
    document.getElementById('btn-delete-event').addEventListener('click', () => {
      if (this.pendingDeleteEvent) {
        this.openDeleteConfirm(this.pendingDeleteEvent);
      }
    });

    // Ações de Exclusão
    document.getElementById('btn-del-confirm-ok').addEventListener('click', () => {
      if (!this.pendingDeleteEvent) return;
      AppState.events = AppState.events.filter(e => e.id !== this.pendingDeleteEvent.id);
      AppState.save();
      this.closeAllModals();
      UIRenderer.renderAll();
    });

    document.getElementById('btn-del-single').addEventListener('click', () => {
      if (!this.pendingDeleteEvent) return;
      const key = `${this.pendingDeleteEvent.id}::${this.pendingDeleteEvent.date}`;
      if (!AppState.suppressedOccurrences.includes(key)) {
        AppState.suppressedOccurrences.push(key);
      }
      AppState.save();
      this.closeAllModals();
      UIRenderer.renderAll();
    });

    document.getElementById('btn-del-series').addEventListener('click', () => {
      if (!this.pendingDeleteEvent) return;
      AppState.events = AppState.events.filter(e => e.id !== this.pendingDeleteEvent.id);
      AppState.save();
      this.closeAllModals();
      UIRenderer.renderAll();
    });

    // Modal Ajustes e Categorias
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettingsModal());

    document.getElementById('btn-reset-demo').addEventListener('click', () => {
      AppState.resetToDefault();
      this.renderCategoriesSettings();
      UIRenderer.renderAll();
    });

    // Fechar Modais
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.close;
        if (targetId) {
          document.getElementById(targetId).classList.add('hidden');
        } else {
          this.closeAllModals();
        }
      });
    });
  },

  navigate(direction) {
    const d = AppState.anchorDate;
    if (AppState.currentView === 'day') {
      AppState.anchorDate = addDays(d, direction);
    } else if (AppState.currentView === 'week') {
      AppState.anchorDate = addDays(d, direction * 7);
    } else {
      AppState.anchorDate = new Date(d.getFullYear(), d.getMonth() + direction, 1);
    }
    UIRenderer.renderAll();
  },

  populateCategorySelect(selectedId) {
    const select = document.getElementById('ev-category');
    select.innerHTML = AppState.categories.map(cat =>
      `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.name}</option>`
    ).join('');
  },

  openCreateModal() {
    this.pendingDeleteEvent = null;
    document.getElementById('modal-event-title').textContent = 'Novo Compromisso';
    document.getElementById('ev-id').value = '';
    document.getElementById('ev-title').value = '';
    this.populateCategorySelect(AppState.categories[0]?.id);
    document.getElementById('ev-date').value = formatDateISO(AppState.anchorDate);
    document.getElementById('ev-start').value = '09:00';
    document.getElementById('ev-end').value = '10:00';
    document.getElementById('ev-recurrence').value = 'none';
    document.getElementById('btn-delete-event').classList.add('hidden');
    document.getElementById('modal-event').classList.remove('hidden');
  },

  openEditModal(ev) {
    this.pendingDeleteEvent = ev;
    document.getElementById('modal-event-title').textContent = 'Editar Compromisso';
    document.getElementById('ev-id').value = ev.id;
    document.getElementById('ev-title').value = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
    this.populateCategorySelect(ev.categoryId);
    document.getElementById('ev-date').value = ev.date;
    document.getElementById('ev-start').value = ev.startTime;
    document.getElementById('ev-end').value = ev.endTime;
    document.getElementById('ev-recurrence').value = ev.recurrence || 'none';
    document.getElementById('btn-delete-event').classList.remove('hidden');
    document.getElementById('modal-event').classList.remove('hidden');
  },

  saveEventFromForm() {
    const id = document.getElementById('ev-id').value;
    const title = document.getElementById('ev-title').value.trim();
    const categoryId = document.getElementById('ev-category').value;
    const date = document.getElementById('ev-date').value;
    const startTime = document.getElementById('ev-start').value;
    const endTime = document.getElementById('ev-end').value;
    const recurrence = document.getElementById('ev-recurrence').value;

    if (!title || !date || !startTime || !endTime) return;

    if (id) {
      const existing = AppState.events.find(e => e.id === id);
      if (existing) {
        existing.title = title;
        existing.categoryId = categoryId;
        existing.date = date;
        existing.startTime = startTime;
        existing.endTime = endTime;
        existing.recurrence = recurrence;
        // Se moveu para o futuro, força status pendente
        if (AppState.isFutureEvent(existing)) {
          existing.status = 'pendente';
        }
      }
    } else {
      const newEv = {
        id: 'ev-' + Date.now(),
        title,
        categoryId,
        date,
        startTime,
        endTime,
        status: 'pendente',
        recurrence,
        isCompensated: false
      };
      AppState.events.push(newEv);
    }

    AppState.enforceTemporalConsistency();
    AppState.save();
    this.closeAllModals();
    UIRenderer.renderAll();
  },

  openDeleteConfirm(ev) {
    document.getElementById('modal-event').classList.add('hidden');
    const isRecurring = ev.recurrence && ev.recurrence !== 'none';
    document.getElementById('delete-confirm-text').textContent = isRecurring
      ? `Este compromisso faz parte de uma recorrência. Como deseja excluir "${ev.title}"?`
      : `Tem certeza que deseja excluir "${ev.title}"?`;

    document.getElementById('recurring-delete-options').classList.toggle('hidden', !isRecurring);
    document.getElementById('single-delete-options').classList.toggle('hidden', isRecurring);
    document.getElementById('modal-delete-confirm').classList.remove('hidden');
  },

  openSettingsModal() {
    this.renderCategoriesSettings();
    document.getElementById('modal-settings').classList.remove('hidden');
  },

  renderCategoriesSettings() {
    const list = document.getElementById('categories-list');
    list.innerHTML = '';

    AppState.categories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'category-row';

      const optionsHtml = [
        `<option value="" ${!cat.displaceTargetId ? 'selected' : ''}>Nenhum</option>`,
        ...AppState.categories
          .filter(other => other.id !== cat.id)
          .map(other => `<option value="${other.id}" ${cat.displaceTargetId === other.id ? 'selected' : ''}>${other.name}</option>`)
      ].join('');

      row.innerHTML = `
        <div class="category-info">
          <span class="cat-dot" style="--cat-color: ${cat.color}"></span>
          <span>${cat.name}</span>
        </div>
        <div class="category-target-wrap">
          <span>Alvo:</span>
          <select data-cat-id="${cat.id}" class="cat-target-select">
            ${optionsHtml}
          </select>
        </div>
      `;

      row.querySelector('.cat-target-select').addEventListener('change', e => {
        cat.displaceTargetId = e.target.value || null;
        AppState.save();
      });

      list.appendChild(row);
    });
  },

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  }
};

document.addEventListener('DOMContentLoaded', () => AppController.init());
