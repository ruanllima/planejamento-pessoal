const ToastManager = {
  items: [], // { id, message, count, timer }

  push(message) {
    const existing = this.items.find(t => t.message === message);
    if (existing) {
      existing.count += 1;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.dismiss(existing.id), 3600);
      this.render();
      return;
    }

    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
    const item = {
      id,
      message,
      count: 1,
      timer: setTimeout(() => this.dismiss(id), 3600)
    };
    this.items.push(item);
    this.render();
  },

  dismiss(id) {
    const idx = this.items.findIndex(t => t.id === id);
    if (idx !== -1) {
      clearTimeout(this.items[idx].timer);
      this.items.splice(idx, 1);
      this.render();
    }
  },

  render() {
    const deck = document.getElementById('toast-deck');
    deck.innerHTML = '';

    this.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'toast-item';

      // Exibir o valor/contador APENAS se houver sobreposição acima de dois (>= 2)
      const counterHtml = item.count >= 2
        ? `<span class="toast-counter">x${item.count}</span>`
        : '';

      el.innerHTML = `
        <span class="toast-msg">${item.message}</span>
        ${counterHtml}
      `;

      // Swipe horizontal para dispensar
      let startX = 0;
      el.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
      }, { passive: true });

      el.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 140));
      }, { passive: true });

      el.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 65) {
          this.dismiss(item.id);
        } else {
          el.style.transform = '';
          el.style.opacity = '1';
        }
      });

      deck.appendChild(el);
    });
  }
};

const UIRenderer = {
  renderAll() {
    this.renderFixedMonthHeader();
    this.renderUniversalSubheader();
    this.renderActiveView();
  },

  // Label Mês e Ano fixa, independente da visualização (Dia, Semana ou Mês)
  renderFixedMonthHeader() {
    const el = document.getElementById('fixed-month-year');
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
    const text = formatter.format(AppState.anchorDate).replace(' de ', ' ');
    el.textContent = text;
  },

  // Divisória Universal adaptativa conforme a visualização ativa
  renderUniversalSubheader() {
    const container = document.getElementById('universal-subheader');
    const todayStr = formatDateISO(new Date());
    const anchor = AppState.anchorDate;

    if (AppState.currentView === 'day') {
      const weekdayFull = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(anchor);
      const dayNum = anchor.getDate();
      const isToday = formatDateISO(anchor) === todayStr;

      container.innerHTML = `
        <div class="subheader-day">
          <span class="subheader-day-name">${weekdayFull}</span>
          <div class="subheader-day-badge">
            <span>Dia</span>
            <span class="date-pill ${isToday ? 'is-today' : 'is-other'}">${dayNum}</span>
          </div>
        </div>
      `;
      return;
    }

    if (AppState.currentView === 'week') {
      const startOfWeek = addDays(anchor, -anchor.getDay()); // Domingo
      const endOfWeek = addDays(startOfWeek, 6); // Sábado

      const startDayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
        .format(startOfWeek).replace('.', '');
      const endDayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
        .format(endOfWeek).replace('.', '');

      const startDateFmt = startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const endDateFmt = endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      container.innerHTML = `
        <div class="subheader-week-range">
          <div class="week-minicard">
            <span class="week-minicard-day">${startDayShort}</span>
            <span class="week-minicard-date">${startDateFmt}</span>
          </div>
          <span class="week-range-sep">a</span>
          <div class="week-minicard">
            <span class="week-minicard-day">${endDayShort}</span>
            <span class="week-minicard-date">${endDateFmt}</span>
          </div>
        </div>
      `;
      return;
    }

    // Modo Mês
    const monthEvents = this.getEventsForMonth(anchor.getFullYear(), anchor.getMonth());
    container.innerHTML = `
      <div class="subheader-month-info">
        <span>Visão Geral do Mês</span>
        <span>${monthEvents.length} compromisso(s)</span>
      </div>
    `;
  },

  renderActiveView() {
    const container = document.getElementById('view-container');
    if (AppState.currentView === 'day') {
      this.renderDayView(container);
    } else if (AppState.currentView === 'week') {
      this.renderWeekView(container);
    } else {
      this.renderMonthView(container);
    }
  },

  getEventsForDate(dateStr) {
    const targetDate = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = targetDate.getDay();

    const list = [];
    AppState.events.forEach(ev => {
      const suppressionKey = `${ev.id}::${dateStr}`;
      if (AppState.suppressedOccurrences.includes(suppressionKey)) return;

      if (ev.date === dateStr) {
        list.push(ev);
      } else if (ev.recurrence !== 'none' && ev.date < dateStr) {
        if (ev.recurrence === 'daily') {
          list.push({ ...ev, date: dateStr, status: 'pendente', virtualDate: dateStr });
        } else if (ev.recurrence === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) {
          list.push({ ...ev, date: dateStr, status: 'pendente', virtualDate: dateStr });
        } else if (ev.recurrence === 'weekly') {
          const originDay = new Date(ev.date + 'T00:00:00').getDay();
          if (originDay === dayOfWeek) {
            list.push({ ...ev, date: dateStr, status: 'pendente', virtualDate: dateStr });
          }
        }
      }
    });

    return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  },

  getEventsForMonth(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let all = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateISO(new Date(year, month, d));
      all = all.concat(this.getEventsForDate(dateStr));
    }
    return all;
  },

  renderEventCard(ev) {
    const category = AppState.categories.find(c => c.id === ev.categoryId) || {
      name: 'Geral',
      color: '#a8a8a0'
    };

    const isFuture = AppState.isFutureEvent(ev);
    // Invariante visual: futuro nunca exibe 'nao_realizado'
    const effectiveStatus = isFuture ? 'pendente' : ev.status;

    const statusLabelMap = {
      realizado: 'Realizado',
      nao_realizado: 'Não realizado',
      pendente: 'Pendente'
    };

    const statusClassMap = {
      realizado: 'done',
      nao_realizado: 'missed',
      pendente: 'pending'
    };

    // Cardzinho amarelo minimalista "New" no lugar de "(Compensação)"
    const cleanTitle = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
    const newBadgeHtml = ev.isCompensated
      ? `<span class="badge-new">New</span>`
      : '';

    const card = document.createElement('div');
    card.className = `event-card status-${statusClassMap[effectiveStatus]} ${isFuture ? 'is-future' : 'is-toggleable'}`;
    card.style.setProperty('--cat-color', category.color);

    card.innerHTML = `
      <div class="event-card-main">
        <div class="event-title-row">
          <span class="event-title">${cleanTitle}</span>
          ${newBadgeHtml}
        </div>
        <div class="event-meta">
          <span>${ev.startTime} – ${ev.endTime}</span>
          <span class="event-cat-tag">
            <span class="cat-dot" style="--cat-color: ${category.color}"></span>
            ${category.name}
          </span>
        </div>
      </div>
      <div class="event-card-right">
        <span class="status-chip ${statusClassMap[effectiveStatus]}">${statusLabelMap[effectiveStatus]}</span>
        <button type="button" class="btn-icon btn-edit-ev" title="Editar compromisso" aria-label="Editar">&#9998;</button>
      </div>
    `;

    // Clique no card alterna status APENAS se não for futuro (sem emitir pop-up)
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-edit-ev')) {
        AppController.openEditModal(ev);
        return;
      }
      if (isFuture) {
        return; // Bloqueado silenciosamente para compromissos futuros
      }
      CompensationEngine.toggleEventStatus(ev.id);
      this.renderAll();
    });

    return card;
  },

  renderDayView(container) {
    container.innerHTML = '';
    const dateStr = formatDateISO(AppState.anchorDate);
    const events = this.getEventsForDate(dateStr);

    if (events.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum compromisso agendado para este dia.</div>`;
      return;
    }

    events.forEach(ev => {
      container.appendChild(this.renderEventCard(ev));
    });
  },

  renderWeekView(container) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'week-grid';

    const startOfWeek = addDays(AppState.anchorDate, -AppState.anchorDate.getDay());
    const todayStr = formatDateISO(new Date());

    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(startOfWeek, i);
      const dateStr = formatDateISO(dayDate);
      const isToday = dateStr === todayStr;
      const weekdayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
        .format(dayDate).replace('.', '');

      const col = document.createElement('div');
      col.className = 'week-day-column';

      col.innerHTML = `
        <div class="week-day-header">
          <span class="week-day-name">${weekdayName}</span>
          <span class="date-pill ${isToday ? 'is-today' : 'is-other'}">${dayDate.getDate()}</span>
        </div>
      `;

      const events = this.getEventsForDate(dateStr);
      if (events.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.padding = '12px';
        empty.textContent = 'Livre';
        col.appendChild(empty);
      } else {
        events.forEach(ev => col.appendChild(this.renderEventCard(ev)));
      }

      grid.appendChild(col);
    }

    container.appendChild(grid);
  },

  renderMonthView(container) {
    container.innerHTML = '';
    const year = AppState.anchorDate.getFullYear();
    const month = AppState.anchorDate.getMonth();
    const todayStr = formatDateISO(new Date());

    const weekdaysHeader = document.createElement('div');
    weekdaysHeader.className = 'month-weekdays';
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(label => {
      const span = document.createElement('span');
      span.textContent = label;
      weekdaysHeader.appendChild(span);
    });
    container.appendChild(weekdaysHeader);

    const grid = document.createElement('div');
    grid.className = 'month-grid';

    const firstDayOfMonth = new Date(year, month, 1);
    const startCellDate = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());

    for (let i = 0; i < 42; i++) {
      const cellDate = addDays(startCellDate, i);
      const dateStr = formatDateISO(cellDate);
      const isCurrentMonth = cellDate.getMonth() === month;
      const isToday = dateStr === todayStr;

      const cell = document.createElement('div');
      cell.className = `month-cell ${isCurrentMonth ? '' : 'is-outside'}`;

      const events = this.getEventsForDate(dateStr);
      const miniItems = events.slice(0, 3).map(ev => {
        const cat = AppState.categories.find(c => c.id === ev.categoryId);
        const color = cat ? cat.color : '#a8a8a0';
        const cleanTitle = ev.title.replace(/\s*\(Compensação\)/gi, '').trim();
        return `<div class="month-mini-item" style="--cat-color:${color}">${ev.startTime} ${cleanTitle}</div>`;
      }).join('');

      cell.innerHTML = `
        <div class="month-cell-top">
          <span class="date-pill ${isToday ? 'is-today' : 'is-other'}">${cellDate.getDate()}</span>
        </div>
        <div class="month-dot-list">${miniItems}</div>
      `;

      cell.addEventListener('click', () => {
        AppState.anchorDate = cellDate;
        AppState.currentView = 'day';
        document.querySelectorAll('.seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.view === 'day');
        });
        this.renderAll();
      });

      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }
};
