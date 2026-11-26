import { createEvent, EVENT_STATUS, SHIFT_ORDER, SHIFTS } from '../domain/entities.js';
import {
  addDays,
  formatDayShort,
  getMonthGridDates,
  getMonthName,
  getWeekdayLabel,
  getWeekDates,
  inferShiftFromTime,
  parseDateStr,
  toDateStr
} from '../domain/DateUtils.js';

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
          <p class="view-subtitle">Modo ${settings.time_mode === '24h' ? 'Horário Específico (24h)' : 'Turnos (M / T / N)'}</p>
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

          <button class="btn btn-primary" id="btn-new-event">+ Novo</button>
        </div>
      </header>

      <div id="agenda-content"></div>
    `;

    this._bindHeaderEvents(categories, settings);

    const contentEl = this.container.querySelector('#agenda-content');
    if (this.viewMode === 'day') {
      this._renderDayView(contentEl, this.anchorDate, events, catMap, settings, todayStr);
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

  _bindHeaderEvents(categories, settings) {
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

    this.container.querySelector('#btn-new-event').addEventListener('click', () => {
      this._openEventFormModal({ date: this.anchorDate, shift: 'morning' }, categories, settings);
    });
  }

  _renderWeekView(container, weekDates, events, catMap, settings, todayStr) {
    const grid = document.createElement('div');
    grid.className = 'week-grid';

    for (const dateStr of weekDates) {
      const col = document.createElement('article');
      col.className = `day-column ${dateStr === todayStr ? 'is-today' : ''}`;
      const dayNum = parseDateStr(dateStr).getDate();

      col.innerHTML = `
        <div class="day-col-header">
          <span class="day-name">${getWeekdayLabel(dateStr)}</span>
          <span class="day-num">${String(dayNum).padStart(2, '0')}</span>
        </div>
      `;

      for (const shiftId of SHIFT_ORDER) {
        const shiftMeta = SHIFTS[shiftId.toUpperCase()];
        const slotEvents = events.filter((e) => e.date === dateStr && e.shift === shiftId);

        const slotWrap = document.createElement('div');
        slotWrap.className = 'shift-slot';
        slotWrap.innerHTML = `
          <div class="shift-label">
            <span>${shiftMeta.label}</span>
            <span>${shiftMeta.start}</span>
          </div>
        `;

        if (slotEvents.length === 0) {
          const ghost = document.createElement('button');
          ghost.type = 'button';
          ghost.className = 'slot-ghost';
          ghost.textContent = '+ Adicionar';
          ghost.addEventListener('click', async () => {
            const cats = await this.repo.getCategories();
            this._openEventFormModal({ date: dateStr, shift: shiftId }, cats, settings);
          });
          slotWrap.appendChild(ghost);
        } else {
          for (const ev of slotEvents) {
            slotWrap.appendChild(this._buildEventCard(ev, catMap.get(ev.category_id), settings));
          }
        }

        col.appendChild(slotWrap);
      }

      grid.appendChild(col);
    }

    container.appendChild(grid);
  }

  _renderDayView(container, dateStr, events, catMap, settings, todayStr) {
    const list = document.createElement('div');
    list.className = 'day-single-list';

    for (const shiftId of SHIFT_ORDER) {
      const shiftMeta = SHIFTS[shiftId.toUpperCase()];
      const slotEvents = events.filter((e) => e.date === dateStr && e.shift === shiftId);

      const card = document.createElement('div');
      card.className = 'day-single-card';
      card.innerHTML = `
        <div class="shift-label">
          <span style="font-size:0.85rem; color:var(--text-primary);">${shiftMeta.label}</span>
          <span>${shiftMeta.start} – ${shiftMeta.end}</span>
        </div>
      `;

      if (slotEvents.length === 0) {
        const ghost = document.createElement('button');
        ghost.type = 'button';
        ghost.className = 'slot-ghost';
        ghost.textContent = `+ Adicionar bloco em ${shiftMeta.label}`;
        ghost.addEventListener('click', async () => {
          const cats = await this.repo.getCategories();
          this._openEventFormModal({ date: dateStr, shift: shiftId }, cats, settings);
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
      <div class="event-card-top">
        <div class="event-title">${this._escape(ev.title)}</div>
      </div>
      <div class="event-meta">
        <span style="color:${color}; font-weight:700;">● ${this._escape(catName)}${timeTag}</span>
        <span class="status-pill ${ev.status}">${statusLabels[ev.status]}</span>
      </div>
      <div class="event-actions">
        <button type="button" class="btn-quick-fail ${isFailed ? 'is-failed' : ''}">
          ${isFailed ? '✓ Marcar Realizado' : '✕ Não fiz'}
        </button>
        <button type="button" class="btn-card-edit" aria-label="Editar evento">Editar</button>
      </div>
    `;

    card.querySelector('.btn-quick-fail').addEventListener('click', async () => {
      if (!isFailed) {
        const result = await this.engine.markEventAsFailedAndCompensate(ev.id);
        if (result.compensated && result.log) {
          this.showToast(
            `Compensado automaticamente!`,
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
        this.showToast('Evento restaurado para Realizado.');
      }
      await this.onStateChange();
    });

    card.querySelector('.btn-card-edit').addEventListener('click', async () => {
      const cats = await this.repo.getCategories();
      this._openEventFormModal(ev, cats, settings);
    });

    return card;
  }

  _openDayQuickSheet(dateStr, dayEvents, categories, settings) {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

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
              <div style="font-size:0.75rem; color:var(--text-secondary);">${shiftMeta.label}</div>
              <div style="font-weight:700;">${this._escape(ev.title)}</div>
              <div style="font-size:0.75rem; color:${cat ? cat.color : '#888'};">${cat ? cat.name : ''}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-edit-quick">Editar</button>
          </div>
        `;
        row.querySelector('.btn-edit-quick').addEventListener('click', () => {
          this._openEventFormModal(ev, categories, settings);
        });
      } else {
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.875rem; color:var(--text-secondary);">${shiftMeta.label} (${shiftMeta.start})</span>
            <button type="button" class="btn btn-primary btn-add-quick">+ Alocar</button>
          </div>
        `;
        row.querySelector('.btn-add-quick').addEventListener('click', () => {
          this._openEventFormModal({ date: dateStr, shift: shiftId }, categories, settings);
        });
      }

      wrap.appendChild(row);
    }

    this.modal.open(`Turnos — ${formatDayShort(dateStr)}`, wrap);
  }

  _openEventFormModal(eventDraft, categories, settings) {
    const isEdit = Boolean(eventDraft.id);
    const defaultCat = categories[0] ? categories[0].id : '';
    const is24h = settings.time_mode === '24h';

    const form = document.createElement('form');
    form.className = 'form-grid';
    form.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="ev-title">Título do Compromisso</label>
        <input class="input-control" id="ev-title" type="text" required placeholder="Ex: Sprint Backend" value="${this._escape(eventDraft.title || '')}" />
      </div>

      <div class="field-group">
        <label class="field-label" for="ev-cat">Categoria</label>
        <select class="input-control" id="ev-cat">
          ${categories
            .map(
              (c) =>
                `<option value="${c.id}" ${c.id === (eventDraft.category_id || defaultCat) ? 'selected' : ''}>${this._escape(c.name)}</option>`
            )
            .join('')}
        </select>
      </div>

      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="ev-date">Data</label>
          <input class="input-control" id="ev-date" type="date" required value="${eventDraft.date || this.anchorDate}" />
        </div>

        <div class="field-group">
          <label class="field-label" for="ev-shift">Turno</label>
          <select class="input-control" id="ev-shift">
            ${SHIFT_ORDER.map((sId) => {
              const s = SHIFTS[sId.toUpperCase()];
              return `<option value="${sId}" ${sId === (eventDraft.shift || 'morning') ? 'selected' : ''}>${s.label} (${s.start})</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      ${
        is24h
          ? `
      <div class="form-grid form-grid-2">
        <div class="field-group">
          <label class="field-label" for="ev-start">Início (24h)</label>
          <input class="input-control" id="ev-start" type="time" value="${eventDraft.start_time || '08:00'}" />
        </div>
        <div class="field-group">
          <label class="field-label" for="ev-end">Fim (24h)</label>
          <input class="input-control" id="ev-end" type="time" value="${eventDraft.end_time || '10:00'}" />
        </div>
      </div>`
          : ''
      }

      ${
        isEdit
          ? `
      <div class="field-group">
        <label class="field-label" for="ev-status">Status</label>
        <select class="input-control" id="ev-status">
          <option value="${EVENT_STATUS.PENDING}" ${eventDraft.status === EVENT_STATUS.PENDING ? 'selected' : ''}>Pendente (Amarelo)</option>
          <option value="${EVENT_STATUS.DONE}" ${eventDraft.status === EVENT_STATUS.DONE ? 'selected' : ''}>Realizado (Verde)</option>
          <option value="${EVENT_STATUS.FAILED}" ${eventDraft.status === EVENT_STATUS.FAILED ? 'selected' : ''}>Não Realizado (Vermelho)</option>
        </select>
      </div>`
          : ''
      }

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="submit" class="btn btn-primary" style="flex:1;">Salvar</button>
        ${
          isEdit
            ? `<button type="button" class="btn btn-danger" id="btn-del-ev">Excluir</button>`
            : ''
        }
      </div>
    `;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = form.querySelector('#ev-title').value;
      const category_id = form.querySelector('#ev-cat').value;
      const date = form.querySelector('#ev-date').value;
      let shift = form.querySelector('#ev-shift').value;
      const start_time = is24h ? form.querySelector('#ev-start').value : null;
      const end_time = is24h ? form.querySelector('#ev-end').value : null;
      if (is24h && start_time) {
        shift = inferShiftFromTime(start_time);
      }

      const newStatus = isEdit ? form.querySelector('#ev-status').value : EVENT_STATUS.PENDING;

      if (isEdit && newStatus === EVENT_STATUS.FAILED && eventDraft.status !== EVENT_STATUS.FAILED) {
        await this.repo.saveEvent({ ...eventDraft, title, category_id, date, shift, start_time, end_time });
        await this.engine.markEventAsFailedAndCompensate(eventDraft.id);
      } else {
        const record = createEvent({
          ...eventDraft,
          title,
          category_id,
          date,
          shift,
          start_time,
          end_time,
          status: newStatus,
          manual_status_override: isEdit ? true : false
        });
        await this.repo.saveEvent(record);
      }

      this.modal.close();
      await this.onStateChange();
    });

    if (isEdit) {
      form.querySelector('#btn-del-ev').addEventListener('click', async () => {
        await this.repo.deleteEvent(eventDraft.id);
        this.modal.close();
        await this.onStateChange();
      });
    }

    this.modal.open(isEdit ? 'Editar Compromisso' : 'Novo Compromisso', form);
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
