import { createEvent, EVENT_STATUS, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';
import {
  addDays,
  formatDayShort,
  getMonthGridDates,
  getMonthName,
  getWeekdayFull,
  getWeekDates,
  inferShiftFromTime,
  parseDateStr,
  toDateStr
} from '../domain/DateUtils.js';

const ICONS = {
  fail: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  done: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  remove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
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
      <header class="view-header">
        <div>
          <h1 class="view-title">${this._getHeaderTitle()}</h1>
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

  _getHeaderTitle() {
    const d = parseDateStr(this.anchorDate);
    if (this.viewMode === 'day') {
      return formatDayShort(this.anchorDate);
    }
    if (this.viewMode === 'week') {
      const week = getWeekDates(this.anchorDate);
      return `${formatDayShort(week[0])} – ${formatDayShort(week[6])}`;
    }
    return `${getMonthName(d.getMonth())} ${d.getFullYear()}`;
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
          <span class="day-num">${dateLabel}</span>
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
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `month-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${cell.dateStr === todayStr ? 'is-today' : ''}`;

      const barsHtml = SHIFT_ORDER.map((shiftId) => {
        const ev = dayEvents.find((e) => e.shift === shiftId);
        if (!ev) return '';
        const cat = catMap.get(ev.category_id);
        const color = cat ? cat.color : '#64748B';
        const isFailed = ev.status === EVENT_STATUS.FAILED;
        return `<span class="month-dot-bar ${isFailed ? 'failed' : ''}" style="--cat-color:${color}" title="${ev.title}"></span>`;
      }).join('');

      btn.innerHTML = `
        <span class="month-cell-num">${cell.dayNum}</span>
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
    const statusLabels = {
      [EVENT_STATUS.PENDING]: 'Pendente',
      [EVENT_STATUS.DONE]: 'Realizado',
      [EVENT_STATUS.FAILED]: 'Não Realizado'
    };

    const card = document.createElement('div');
    card.className = 'event-card';
    card.dataset.status = ev.status;
    card.style.setProperty('--cat-color', color);

    const timeTag =
      settings.time_mode === '24h' && ev.start_time ? ` • ${ev.start_time}` : '';

    const isFailed = ev.status === EVENT_STATUS.FAILED;

    card.innerHTML = `
      <div class="event-main">
        <div class="event-title">${this._escape(ev.title)}</div>
        <div class="event-meta">
          <span style="color:${color}; font-weight:700;">● ${this._escape(catName)}${timeTag}</span>
          <span class="status-pill ${ev.status}">${statusLabels[ev.status]}</span>
        </div>
      </div>
      <div class="event-icon-actions">
        <button type="button" class="icon-action-btn btn-fail ${isFailed ? 'is-failed' : ''}" aria-label="${isFailed ? 'Marcar como realizado' : 'Marcar como não realizado'}" title="${isFailed ? 'Realizado' : 'Não fiz'}">
          ${isFailed ? ICONS.done : ICONS.fail}
        </button>
        <button type="button" class="icon-action-btn btn-edit" aria-label="Editar" title="Editar">
          ${ICONS.edit}
        </button>
        <button type="button" class="icon-action-btn btn-delete" aria-label="Excluir" title="Excluir">
          ${ICONS.remove}
        </button>
      </div>
    `;

    card.querySelector('.btn-fail').addEventListener('click', async () => {
      if (!isFailed) {
        const result = await this.engine.markEventAsFailedAndCompensate(ev.id);
        if (result.compensated && result.log) {
          this.showToast(
            'Compensado automaticamente.',
            'Desfazer',
            async () => {
              await this.engine.rollbackCompensation(result.log.id);
              await this.onStateChange();
            }
          );
        } else {
          this.showToast('Marcado como não realizado.');
        }
      } else {
        await this.repo.saveEvent({
          ...ev,
          status: EVENT_STATUS.DONE,
          manual_status_override: true
        });
        this.showToast('Marcado como realizado.');
      }
      await this.onStateChange();
    });

    card.querySelector('.btn-edit').addEventListener('click', async () => {
      const cats = await this.repo.getCategories();
      this._openQuickEventModal(ev, cats, settings);
    });

    card.querySelector('.btn-delete').addEventListener('click', async () => {
      await this.repo.deleteEvent(ev.id);
      this.showToast('Compromisso excluído.');
      await this.onStateChange();
    });

    return card;
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
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              <div style="font-size:0.72rem; color:var(--text-secondary);">${shiftMeta.label}</div>
              <div style="font-weight:700;">${this._escape(ev.title)}</div>
              <div style="font-size:0.75rem; color:${cat ? cat.color : '#888'};">${cat ? cat.name : ''}</div>
            </div>
            <div class="event-icon-actions">
              <button type="button" class="icon-action-btn btn-edit-quick" aria-label="Editar">${ICONS.edit}</button>
              <button type="button" class="icon-action-btn btn-delete btn-del-quick" aria-label="Excluir">${ICONS.remove}</button>
            </div>
          </div>
        `;
        row.querySelector('.btn-edit-quick').addEventListener('click', () => {
          this._openQuickEventModal(ev, categories, settings);
        });
        row.querySelector('.btn-del-quick').addEventListener('click', async () => {
          await this.repo.deleteEvent(ev.id);
          this.modal.close();
          await this.onStateChange();
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

    const initialTitle = isEdit ? eventDraft.title : lastAutoTitle;
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

      const record = createEvent({
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

      await this.repo.saveEvent(record);
      this.modal.close();
      await this.onStateChange();
    });

    this.modal.open(`${formatDayShort(eventDraft.date || this.anchorDate)} • ${shiftLabel}`, form);
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
