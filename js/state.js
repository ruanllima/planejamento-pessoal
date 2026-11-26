const STORAGE_KEY = 'chronos_agenda_state_v2';

const DEFAULT_CATEGORIES = [
  { id: 'estudo', name: 'Estudo & Engenharia', color: '#38bdf8', priority: 1, displaceTargetId: 'lazer' },
  { id: 'trabalho', name: 'Trabalho & Áudio', color: '#a78bfa', priority: 2, displaceTargetId: 'lazer' },
  { id: 'saude', name: 'Saúde & Treino', color: '#4ade80', priority: 3, displaceTargetId: null },
  { id: 'lazer', name: 'Lazer & Livre', color: '#fbbf24', priority: 4, displaceTargetId: null }
];

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDate, days) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function buildSeedEvents() {
  const now = new Date();
  const todayStr = formatDateISO(now);
  const yesterdayStr = formatDateISO(addDays(now, -1));
  const tomorrowStr = formatDateISO(addDays(now, 1));
  const plus2Str = formatDateISO(addDays(now, 2));

  // Regra rígida: NENHUM evento futuro nasce como 'nao_realizado'. Apenas 'pendente'.
  return [
    {
      id: 'ev-past-1',
      title: 'Revisão de Arquitetura & SOLID',
      categoryId: 'estudo',
      date: yesterdayStr,
      startTime: '08:00',
      endTime: '09:30',
      status: 'realizado',
      recurrence: 'none',
      isCompensated: false
    },
    {
      id: 'ev-today-1',
      title: 'Check-up Sistema de Áudio & PA',
      categoryId: 'trabalho',
      date: todayStr,
      startTime: '07:00',
      endTime: '08:30',
      status: 'realizado',
      recurrence: 'none',
      isCompensated: false
    },
    {
      id: 'ev-today-2',
      title: 'Bloco Profundo: Spring Boot & JPA',
      categoryId: 'estudo',
      date: todayStr,
      startTime: '19:00',
      endTime: '20:30',
      status: 'pendente',
      recurrence: 'weekdays',
      isCompensated: false
    },
    {
      id: 'ev-future-1',
      title: 'Treino Físico & Mobilidade',
      categoryId: 'saude',
      date: tomorrowStr,
      startTime: '07:30',
      endTime: '08:30',
      status: 'pendente',
      recurrence: 'none',
      isCompensated: false
    },
    {
      id: 'ev-future-2',
      title: 'Leitura Técnica & Prática Musical',
      categoryId: 'lazer',
      date: plus2Str,
      startTime: '18:00',
      endTime: '19:30',
      status: 'pendente',
      recurrence: 'none',
      isCompensated: false
    }
  ];
}

const AppState = {
  currentView: 'day', // 'day' | 'week' | 'month'
  anchorDate: new Date(),
  categories: [],
  events: [],
  suppressedOccurrences: [], // ["seriesId::YYYY-MM-DD"]

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.categories = parsed.categories || structuredClone(DEFAULT_CATEGORIES);
        this.events = parsed.events || buildSeedEvents();
        this.suppressedOccurrences = parsed.suppressedOccurrences || [];
      } catch (e) {
        this.resetToDefault();
      }
    } else {
      this.resetToDefault();
    }
    this.enforceTemporalConsistency();
    this.save();
  },

  resetToDefault() {
    this.categories = structuredClone(DEFAULT_CATEGORIES);
    this.events = buildSeedEvents();
    this.suppressedOccurrences = [];
    this.save();
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      categories: this.categories,
      events: this.events,
      suppressedOccurrences: this.suppressedOccurrences
    }));
  },

  // Garante invariante: compromissos futuros NUNCA ficam como 'nao_realizado'
  enforceTemporalConsistency() {
    const now = new Date();
    let changed = false;
    this.events.forEach(ev => {
      const startDt = this.getEventStartDateTime(ev);
      if (startDt > now && ev.status === 'nao_realizado') {
        ev.status = 'pendente';
        changed = true;
      }
    });
    if (changed) this.save();
  },

  getEventStartDateTime(ev) {
    const [y, m, d] = ev.date.split('-').map(Number);
    const [hh, mm] = ev.startTime.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  },

  isFutureEvent(ev) {
    return this.getEventStartDateTime(ev) > new Date();
  }
};
