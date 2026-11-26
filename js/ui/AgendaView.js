import { createEvent, EVENT_STATUS, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';
import {
  addDays,
  formatDayMonth,
  formatDayShort,
  getMonthGridDates,
  getMonthName,
  getWeekdayFull,
  getWeekdayLabel,
  getWeekDates,
  inferShiftFromTime,
  isEventInFuture,
  parseDateStr,
  toDateStr
} from '../domain/DateUtils.js';

const ICONS = {
  edit: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
};

export class AgendaView {
  constructor({ container, repo, compensationEngine, recurrenceService, modal, onStateChange, showToast }) {
    this.container = container;
    this.repo = repo;
    this.engine = compensationEngine;
    this.recurrenceService = recurrenceService;
    this.modal = modal;
    this.onStateChange = onStateChange;
    this.showToast = showToast;

    this.viewMode = 'week';
    this.anchorDate = toDateStr(new Date());
  }

  async render() {
    const todayStr = toDateStr(new Date());
    const [categories, settings] = await Promise.all([
      this.repo.getCategories(),
      this.repo.getSettings()
    ]);
    const catMap = new Map(categories.map((c) => [c.id, c]));

    let visibleDates = [];
    if (this.viewMode === 'day') {
      visibleDates = [this.anchorDate];
    } else if (this.viewMode === 'week') {
      visibleDates = getWeekDates(this.anchorDate);
    } else {
      const d = parseDateStr(this.anchorDate);
      visibleDates = getMonthGridDates(d.getFullYear(), d.getMonth()).map((x) => x.dateStr);
    }

    await this.recurrenceService.ensureEventsForRange(visibleDates);
    const events = await this.repo.getEvents();

    this.container.innerHTML = `
      <header class="view-header agenda-top-header">
        <div>
          <h1 class="view-title">${this._getFixedMonthYearTitle()}</h1>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <div class="date-nav">
            <button class="btn-icon" id="nav-prev" aria-label="Período anterior">‹</button>
            <button class="btn btn-secondary" id="nav-today">Hoje</button>
            <button class="btn-icon" id="nav-next" aria-label="Próximo período">›</button>
          </div>

          <div class="segmented-control" role="group" aria-label="Modo de visualização">
            <button class="seg-btn ${this.viewMode === 'day' ? 'active' : ''}" data-mode="day">Dia</button>
            <button class="seg-btn ${this.viewMode === 'week' ? 'active' : ''}" data-mode="week">Semana</button>
            <button class="seg-btn ${this.viewMode === 'month' ? 'active' : ''}" data-mode="month">Mês</button>
          </div>
        </div>
      </header>

      <div class="agenda-sub-divider" aria-live="polite">
        ${this._renderSubDividerContent(todayStr)}
      </div>

      <div id="agenda-content"></div>
    `;

    this._bindHeaderEvents();

    const contentEl = this.container.querySelector('#agenda-content');
    if (this.viewMode === 'day') {
      this._renderDayView(contentEl, this.anchorDate, events, catMap, settings);
    } else if (this.viewMode === 'week') {
      this._renderWeekView(contentEl, visibleDates, events, catMap, settings, todayStr);
    } else {
      this._renderMonthView(contentEl, events, catMap, settings, todayStr);
    }
  }

  // Label Mês e Ano fixa independente da visualização (Dia, Semana ou Mês)
  _getFixedMonthYearTitle() {
    const d = parseDateStr(this.anchorDate);
    return `${getMonthName(d.getMonth())} ${d.getFullYear()}`;
  }

  // Sub-header adaptativo e coadjuvante dentro da divisória universal
  _renderSubDividerContent(todayStr) {
    if (this.viewMode === 'day') {
      const weekdayFull = getWeekdayFull(this.anchorDate);
      const dayDate = formatDayMonth(this.anchorDate);
      const isToday = this.anchorDate === todayStr;
      return `
        <div class="sub-day-bar">
          <span class="sub-day-weekday">${weekdayFull}</span>
          <span class="sub-date-badge ${isToday ? 'is-today' : 'is-other'}">${dayDate}</span>
        </div>
      `;
    }

    if (this.viewMode === 'week') {
      const week = getWeekDates(this.anchorDate);
      const startStr = week[0];
      const endStr = week[6];
      const startIsToday = startStr === todayStr;
      const endIsToday = endStr === todayStr;

      return `
        <div class="sub-week-range">
          <div class="week-range-pill ${startIsToday ? 'has-today' : ''}">
            <span class="week-pill-name">${getWeekdayLabel(startStr)}</span>
            <span class="week-pill-date ${startIsToday ? 'is-today' : 'is-other'}">${formatDayMonth(startStr)}</span>
          </div>
          <span class="week-range-sep">a</span>
          <div class="week-range-pill ${endIsToday ? 'has-today' : ''}">
            <span class="week-pill-name">${getWeekdayLabel(endStr)}</span>
            <span class="week-pill-date ${endIsToday ? 'is-today' : 'is-other'}">${formatDayMonth(endStr)}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="sub-month-bar">
        <span class="sub-month-label">Calendário Mensal</span>
        <span class="sub-month-hint">Toque em um dia para gerenciar turnos</span>
      </div>
    `;
  }

  _bindHeaderEvents() {
    this.container.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.dataset.mode;
        this.render();
      });
    });

    this.container.querySelector('#nav-today').addEventListener('click', () => {
      this.anchorDate = toDateStr(new Date());
      this.render();
    });

    this.container.querySelector('#nav-prev').addEventListener('click', () => {
      if (this.viewMode === 'day') this.anchorDate = addDays(this.anchorDate, -1);
      else if (this.viewMode === 'week') this.anchorDate = addDays(this.anchorDate, -7);
      else {
        const d = parseDateStr(this.anchorDate);
        d.setMonth(d.getMonth() - 1);
        this.anchorDate = toDateStr(d);
      }
      this.render();
    });

    this.container.querySelector('#nav-next').addEventListener('click', () => {
      if (this.viewMode === 'day') this.anchorDate = addDays(this.anchorDate, 1);
      else if (this.viewMode === 'week') this.anchorDate = addDays(this.anchorDate, 7);
      else {
        const d = parseDateStr(this.anchorDate);
        d.setMonth(d.getMonth() + 1);
        this.anchorDate = toDateStr(d);
      }
      this.render();
    });
  }

  _renderWeekView(container, weekDates, events, catMap, settings, todayStr) {
    const list = document.createElement('div');
    list.className = 'week-vertical-list';

    for (const dateStr of weekDates) {
      const dayCard = document.createElement('article');
      dayCard.className = `day-row-card ${dateStr === todayStr ? 'is-today' : ''}`;
      const d = parseDateStr(dateStr);
      const dateLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

      dayCard.innerHTML = `
        <div class="day-col-header">
          <span class="day-name">${getWeekdayFull(dateStr)}</span>
          <span class="day-num ${dateStr === todayStr ? 'is-today' : 'is-other'}">${dateLabel}</span>
        </div>
        <div class="day-shifts-stack"></div>
      `;

      const stack = dayCard.querySelector('.day-shifts-stack');

      for (const shiftId of SHIFT_ORDER) {
        const shiftMeta = SHIFTS[shiftId.toUpperCase()];
        const slotEvents = events.filter((e) => e.date === dateStr && e.shift === shiftId);

        const slotWrap = document.createElement('div');
        slotWrap.className = 'shift-slot';
        slotWrap.innerHTML = `
          <div class="shift-label">
            <span>${shiftMeta.label}</span>
          </div>
        `;

        if (slotEvents.length === 0) {
          const ghost = document.createElement('button');
          ghost.type = 'button';
          ghost.className = 'slot-ghost';
          ghost.textContent = '+ Adicionar';
          ghost.addEventListener('click', async () => {
            const cats = await this.repo.getCategories();
            this._openQuickEventModal({ date: dateStr, shift: shiftId }, cats, settings);
          });
          slotWrap.appendChild(ghost);
        } else {
          for (const ev of slotEvents) {
            slotWrap.appendChild(this._buildEventCard(ev, catMap.get(ev.category_id), settings));
          }
        }

        stack.appendChild(slotWrap);
      }

      list.appendChild(dayCard);
    }

    container.appendChild(list);
  }

  _renderDayView(container, dateStr, events, catMap, settings) {
    const list = document.createElement('div');
    list.className = 'day-single-list';

    for (const shiftId of SHIFT_ORDER) {
      const shiftMeta = SHIFTS[shiftId.toUpperCase()];
      const slotEvents = events.filter((e) => e.date === dateStr && e.shift === shiftId);

      const card = document.createElement('div');
      card.className = 'day-single-card';
      card.innerHTML = `
        <div class="shift-label">
          <span style="font-size:0.82rem; color:var(--text-primary);">${shiftMeta.label}</span>
        </div>
      `;

      if (slotEvents.length === 0) {
        const ghost = document.createElement('button');
        ghost.type = 'button';
        ghost.className = 'slot-ghost';
        ghost.textContent = '+ Adicionar';
        ghost.addEventListener('click', async () => {
          const cats = await this.repo.getCategories();
          this._openQuickEventModal({ date: dateStr, shift: shiftId }, cats, settings);
        });
        card.appendChild(ghost);
      } else {
        for (const ev of slotEvents) {
          card.appendChild(this._buildEventCard(ev, catMap.get(ev.category_id), settings));
        }
      }

      list.appendChild(card);
    }

    container.appendChild(list);
  }

  _renderMonthView(container, events, catMap, settings, todayStr) {
    const d = parseDateStr(this.anchorDate);
    const cells = getMonthGridDates(d.getFullYear(), d.getMonth());

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="month-weekdays">
        <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
      </div>
      <div class="month-grid"></div>
    `;

    const grid = wrapper.querySelector('.month-grid');

    for (const cell of cells) {
      const dayEvents = events.filter((e) => e.date === cell.dateStr);
      const isToday = cell.dateStr === todayStr;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `month-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'is-today' : ''}`;

      const barsHtml = SHIFT_ORDER.map((shiftId) => {
        const ev = dayEvents.find((e) => e.shift === shiftId);
        if (!ev) return '';
        const cat = catMap.get(ev.category_id);
        const color = cat ? cat.color : '#64748B';
        const isFailed = ev.status === EVENT_STATUS.FAILED && !isEventInFuture(ev);
        return `<span class="month-dot-bar ${isFailed ? 'failed' : ''}" style="--cat-color:${color}" title="${ev.title}"></span>`;
      }).join('');

      btn.innerHTML = `
        <span class="month-cell-num ${isToday ? 'is-today' : 'is-other'}">${cell.dayNum}</span>
        <div class="month-dots">${barsHtml}</div>
      `;

      btn.addEventListener('click', async () => {
        const cats = await this.repo.getCategories();
        this._openDayQuickSheet(cell.dateStr, dayEvents, cats, settings);
      });

      grid.appendChild(btn);
    }

    container.appendChild(wrapper);
  }

  _buildEventCard(ev, category, settings) {
    const color = category ? category.color : '#64748B';
    const catName = category ? category.name : 'Sem Categoria';
    const isFuture = isEventInFuture(ev);
    const effectiveStatus = isFuture ? EVENT_STATUS.PENDING : ev.status;

    const statusLabels = {
      [EVENT_STATUS.PENDING]: 'Pendente',
      [EVENT_STATUS.DONE]: 'Realizado',
      [EVENT_STATUS.FAILED]: 'Não Realizado'
    };

    const cleanTitle = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
    const isCompensated = Boolean(ev.is_compensated || ev.compensation_log_id);
    const newBadgeHtml = isCompensated ? `<span class="badge-new">New</span>` : '';

    const card = document.createElement('div');
    card.className = `event-card ${isFuture ? 'is-future' : ''}`;
    card.dataset.status = effectiveStatus;
    card.style.setProperty('--cat-color', color);
    if (!isFuture) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
    }

    const timeTag =
      settings.time_mode === '24h' && ev.start_time ? ` (${ev.start_time})` : '';

    card.innerHTML = `
      <div class="event-main">
        <div class="event-title-row">
          <span class="event-title">${this._escape(cleanTitle)}</span>
          ${newBadgeHtml}
        </div>
        <div class="event-meta">
          <span class="cat-badge"><span class="cat-swatch"></span>${this._escape(catName)}${timeTag}</span>
          <span class="status-pill ${effectiveStatus}">${statusLabels[effectiveStatus]}</span>
        </div>
      </div>
      <div class="event-icon-actions">
        <button type="button" class="icon-action-btn btn-edit" aria-label="Editar">
          ${ICONS.edit}
        </button>
        <button type="button" class="icon-action-btn btn-delete" aria-label="Excluir">
          ${ICONS.trash}
        </button>
      </div>
    `;

    // Clique no próprio card alterna silenciosamente entre Realizado e Não Realizado (bloqueado para futuros, sem pop-up)
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.event-icon-actions')) return;
      if (isFuture) return;

      await this.engine.toggleEventCompletionState(ev.id);
      await this.onStateChange();
    });

    card.querySelector('.btn-edit').addEventListener('click', async (e) => {
      e.stopPropagation();
      const cats = await this.repo.getCategories();
      this._openQuickEventModal(ev, cats, settings);
    });

    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      this._confirmDeleteEvent(ev);
    });

    return card;
  }

  _confirmDeleteEvent(ev) {
    const isRecurrent = Boolean(ev.recurrence_id);
    const cleanTitle = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
    const wrap = document.createElement('div');
    wrap.className = 'form-grid';

    if (isRecurrent) {
      wrap.innerHTML = `
        <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
          Deseja realmente excluir o compromisso recorrente <strong>${this._escape(cleanTitle)}</strong>?
        </p>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:6px;">
          <button type="button" class="btn btn-danger" id="del-rec-one">Excluir apenas este</button>
          <button type="button" class="btn btn-danger" id="del-rec-all">Excluir todos</button>
          <button type="button" class="btn btn-secondary" id="del-rec-cancel">Cancelar</button>
        </div>
      `;

      wrap.querySelector('#del-rec-cancel').addEventListener('click', () => this.modal.close());

      wrap.querySelector('#del-rec-one').addEventListener('click', async () => {
        const supKey = `${ev.date}::${ev.shift}::${ev.recurrence_id}`;
        await this.repo.addSuppressedRecurrence(supKey);
        await this.repo.deleteEvent(ev.id);
        this.modal.close();
        this.showToast('Ocorrência excluída.');
        await this.onStateChange();
      });

      wrap.querySelector('#del-rec-all').addEventListener('click', async () => {
        await this.repo.deleteEventsByRecurrenceId(ev.recurrence_id);
        await this.repo.deleteRecurrence(ev.recurrence_id);
        this.modal.close();
        this.showToast('Todos os compromissos recorrentes excluídos.');
        await this.onStateChange();
      });

      this.modal.open('Excluir compromisso recorrente', wrap);
    } else {
      wrap.innerHTML = `
        <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.5;">
          Deseja realmente excluir <strong>${this._escape(cleanTitle)}</strong>? Esta ação deixará o turno livre.
        </p>
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button type="button" class="btn btn-secondary" style="flex:1;" id="del-cancel">Cancelar</button>
          <button type="button" class="btn btn-danger" style="flex:1;" id="del-confirm">Excluir</button>
        </div>
      `;

      wrap.querySelector('#del-cancel').addEventListener('click', () => this.modal.close());

      wrap.querySelector('#del-confirm').addEventListener('click', async () => {
        await this.repo.deleteEvent(ev.id);
        this.modal.close();
        this.showToast('Compromisso excluído.');
        await this.onStateChange();
      });

      this.modal.open('Confirmar exclusão', wrap);
    }
  }

  _openDayQuickSheet(dateStr, dayEvents, categories, settings) {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    for (const shiftId of SHIFT_ORDER) {
      const shiftMeta = SHIFTS[shiftId.toUpperCase()];
      const ev = dayEvents.find((e) => e.shift === shiftId);
      const row = document.createElement('div');
      row.className = 'panel-card';
      row.style.marginBottom = '0';

      if (ev) {
        const cat = catMap.get(ev.category_id);
        const cleanTitle = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              <div style="font-size:0.72rem; color:var(--text-secondary);">${shiftMeta.label}</div>
              <div style="font-weight:700;">${this._escape(cleanTitle)}</div>
              <div style="font-size:0.75rem; color:${cat ? cat.color : '#888'};">${cat ? cat.name : ''}</div>
            </div>
            <div class="event-icon-actions">
              <button type="button" class="icon-action-btn btn-edit-quick" aria-label="Editar">${ICONS.edit}</button>
              <button type="button" class="icon-action-btn btn-delete btn-del-quick" aria-label="Excluir">${ICONS.trash}</button>
            </div>
          </div>
        `;
        row.querySelector('.btn-edit-quick').addEventListener('click', () => {
          this._openQuickEventModal(ev, categories, settings);
        });
        row.querySelector('.btn-del-quick').addEventListener('click', () => {
          this._confirmDeleteEvent(ev);
        });
      } else {
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.875rem; color:var(--text-secondary);">${shiftMeta.label}</span>
            <button type="button" class="btn btn-primary btn-add-quick">+ Alocar</button>
          </div>
        `;
        row.querySelector('.btn-add-quick').addEventListener('click', () => {
          this._openQuickEventModal({ date: dateStr, shift: shiftId }, categories, settings);
        });
      }

      wrap.appendChild(row);
    }

    this.modal.open(formatDayShort(dateStr), wrap);
  }

  _openQuickEventModal(eventDraft, categories, settings) {
    if (categories.length === 0) {
      this.showToast('Crie uma categoria em Ajustes primeiro.');
      return;
    }

    const isEdit = Boolean(eventDraft.id);
    const is24h = settings.time_mode === '24h';
    let selectedCatId = eventDraft.category_id || categories[0].id;
    let lastAutoTitle = categories.find((c) => c.id === selectedCatId)?.name || '';

    const cleanDraftTitle = eventDraft.title
      ? eventDraft.title.replace(/\s*\(Compensação\)/gi, '').trim()
      : '';
    const initialTitle = isEdit ? cleanDraftTitle : lastAutoTitle;
    const shiftLabel = SHIFTS[(eventDraft.shift || 'morning').toUpperCase()].label;

    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <div class="field-group">
        <span class="field-label">Categoria</span>
        <div class="quick-cat-grid" id="quick-cat-list">
          ${categories
            .map(
              (c) => `
              <button type="button" class="quick-cat-btn ${c.id === selectedCatId ? 'selected' : ''}" data-cat-id="${c.id}" style="--cat-color:${c.color};">
                <span class="cat-dot"></span>
                <span>${this._escape(c.name)}</span>
              </button>
            `
            )
            .join('')}
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="ev-title">Nome</label>
        <input class="input-control" id="ev-title" type="text" required value="${this._escape(initialTitle)}" />
      </div>

      ${
        is24h
          ? `
      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="ev-start">Início</label>
          <input class="input-control" id="ev-start" type="time" value="${eventDraft.start_time || '08:00'}" />
        </div>
        <div class="field-group">
          <label class="field-label" for="ev-end">Fim</label>
          <input class="input-control" id="ev-end" type="time" value="${eventDraft.end_time || '10:00'}" />
        </div>
      </div>`
          : ''
      }

      <button type="submit" class="btn btn-primary" style="width:100%; margin-top:4px;">Salvar</button>
    `;

    const titleInput = form.querySelector('#ev-title');

    form.querySelectorAll('.quick-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCatId = btn.dataset.catId;
        form.querySelectorAll('.quick-cat-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');

        const chosenCat = categories.find((c) => c.id === selectedCatId);
        if (chosenCat) {
          const currentVal = titleInput.value.trim();
          if (!currentVal || currentVal === lastAutoTitle) {
            titleInput.value = chosenCat.name;
          }
          lastAutoTitle = chosenCat.name;
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const chosenCat = categories.find((c) => c.id === selectedCatId);
      const title = titleInput.value.trim() || (chosenCat ? chosenCat.name : 'Compromisso');
      const date = eventDraft.date || this.anchorDate;
      let shift = eventDraft.shift || 'morning';
      const start_time = is24h ? form.querySelector('#ev-start').value : null;
      const end_time = is24h ? form.querySelector('#ev-end').value : null;

      if (is24h && start_time) {
        shift = inferShiftFromTime(start_time);
      }

      const candidate = createEvent({
        ...eventDraft,
        title,
        category_id: selectedCatId,
        date,
        shift,
        start_time,
        end_time,
        status: isEdit ? eventDraft.status : EVENT_STATUS.PENDING,
        manual_status_override: isEdit ? eventDraft.manual_status_override : false
      });

      if (isEventInFuture(candidate)) {
        candidate.status = EVENT_STATUS.PENDING;
        candidate.manual_status_override = false;
      }

      await this.repo.saveEvent(candidate);
      this.modal.close();
      await this.onStateChange();
    });

    this.modal.open(`${formatDayShort(eventDraft.date || this.anchorDate)} (${shiftLabel})`, form);
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
