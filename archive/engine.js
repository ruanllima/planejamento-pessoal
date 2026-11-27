const CompensationEngine = {
  // Atualiza automaticamente compromissos passados ainda pendentes nas viradas de turno (06:00, 12:00, 18:00)
  runShiftAutoCheck() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayStr = formatDateISO(now);

    let updatedCount = 0;

    AppState.events.forEach(ev => {
      if (ev.status !== 'pendente') return;
      if (AppState.isFutureEvent(ev)) return; // Regra rígida: nunca tocar em futuros

      const [endH, endM] = ev.endTime.split(':').map(Number);
      const endMinutes = endH * 60 + endM;

      if (ev.date < todayStr || (ev.date === todayStr && currentMinutes >= endMinutes)) {
        ev.status = 'nao_realizado';
        updatedCount++;
        this.compensateEvent(ev);
      }
    });

    if (updatedCount > 0) {
      AppState.save();
    }
  },

  // Alterna status idempotente (apenas eventos já iniciados/passados)
  toggleEventStatus(eventId) {
    const ev = AppState.events.find(item => item.id === eventId);
    if (!ev) return false;

    // Bloqueio rígido para compromissos futuros
    if (AppState.isFutureEvent(ev)) {
      return false;
    }

    if (ev.status === 'realizado') {
      ev.status = 'nao_realizado';
      this.compensateEvent(ev);
    } else {
      ev.status = 'realizado';
    }

    AppState.save();
    return true;
  },

  // Cria realocação limpa (sem sufixo "(Compensação)" no título; sinalizada via flag isCompensated -> badge "New")
  compensateEvent(missedEvent) {
    if (missedEvent.alreadyCompensated) return;

    const category = AppState.categories.find(c => c.id === missedEvent.categoryId);
    if (!category || !category.displaceTargetId) return;

    const baseDate = new Date(missedEvent.date + 'T00:00:00');
    const targetDate = addDays(baseDate, 1);
    const targetDateStr = formatDateISO(targetDate);

    // Regra rígida: compensação criada no futuro nasce estritamente como 'pendente'
    const newEvent = {
      id: 'comp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title: missedEvent.title.replace(/\s*\(Compensação\)/gi, '').trim(),
      categoryId: missedEvent.categoryId,
      date: targetDateStr,
      startTime: missedEvent.startTime,
      endTime: missedEvent.endTime,
      status: 'pendente',
      recurrence: 'none',
      isCompensated: true
    };

    missedEvent.alreadyCompensated = true;
    AppState.events.push(newEvent);
    ToastManager.push(`Reagendado para ${targetDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`);
  }
};
