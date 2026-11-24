(() => {
  "use strict";

  const STORAGE_KEY = "ritmo.data.v2";
  const LEGACY_KEY = "ritmo.planner.v1";
  const THEME_KEY = "ritmo.theme.v1";
  const SHIFTS = ["morning", "afternoon", "night"];
  const SHIFT_LABELS = { morning: "Manhã", afternoon: "Tarde", night: "Noite" };
  const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const PALETTE = ["#8195d4", "#78aa98", "#c58d7e", "#a58fc9", "#c6a56e", "#70a8b9", "#c47f9a", "#91a47d"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pad = n => String(n).padStart(2, "0");
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const parseDate = key => { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d,12); };
  const todayKey = () => dateKey(new Date());
  const addDays = (date, amount) => { const d = new Date(date); d.setDate(d.getDate()+amount); return d; };
  const startOfWeek = date => { const d = new Date(date); d.setHours(12,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d; };
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const formatDate = key => new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"long"}).format(parseDate(key));
  const formatRange = (start,end) => {
    const a = parseDate(start), b = parseDate(end);
    if (a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear()) return `${a.getDate()}–${b.getDate()} de ${new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(a)}`;
    return `${new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"short"}).format(a)} – ${new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"short",year:"numeric"}).format(b)}`;
  };
  const monthLabel = date => new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(date);

  function emptyData() { return { version:2, categories:[], occurrences:[], changes:[] }; }

  function normalizeLegacy(raw) {
    const data = emptyData();
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.categories) || !Array.isArray(raw.blocks)) return data;
    const oldPriority = { critical:1, high:2, medium:3, flexible:4 };
    const ordered = [...raw.categories].sort((a,b)=>(oldPriority[a.priority]||4)-(oldPriority[b.priority]||4));
    data.categories = raw.categories.map(category => ({
      id: String(category.id || uid()), name: String(category.name || "Categoria"),
      color: /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : PALETTE[0],
      priority: Math.max(1, ordered.findIndex(item=>item.id===category.id)+1),
      goals: {
        morning: Number(category.weeklyGoalsByShift?.morning || 0),
        afternoon: Number(category.weeklyGoalsByShift?.afternoon || 0),
        night: Number(category.weeklyGoalsByShift?.night || 0)
      },
      active: category.active !== false, defaultProtected: category.protected === true
    }));
    data.occurrences = raw.blocks.map(block => ({
      id: String(block.id || uid()), date: String(block.date || todayKey()),
      shift: SHIFTS.includes(block.shift) ? block.shift : "morning",
      categoryId: String(block.categoryId || ""), status: ["completed","missed","cancelled"].includes(block.status) ? block.status : "planned",
      note: String(block.note || ""), overridePriority: null, protected: false,
      createdAt: block.createdAt || new Date().toISOString(), updatedAt: block.updatedAt || new Date().toISOString(),
      legacy: true
    }));
    return data;
  }

  function validateData(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.categories) || !Array.isArray(raw.occurrences)) throw new Error("O arquivo não possui uma estrutura de backup válida.");
    const categories = raw.categories.map((c,index) => {
      if (!c.id || !String(c.name || "").trim()) throw new Error(`Categoria inválida na posição ${index+1}.`);
      return {
        id:String(c.id), name:String(c.name).trim().slice(0,60),
        color:/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[index%PALETTE.length],
        priority:Math.max(1,Number(c.priority)||index+1),
        goals:{morning:Math.max(0,Number(c.goals?.morning)||0),afternoon:Math.max(0,Number(c.goals?.afternoon)||0),night:Math.max(0,Number(c.goals?.night)||0)},
        active:c.active!==false, defaultProtected:c.defaultProtected===true
      };
    });
    const ids = new Set(categories.map(c=>c.id));
    const priorities = categories.map(c=>c.priority);
    if (new Set(priorities).size !== priorities.length) throw new Error("Há categorias com posições de prioridade repetidas.");
    const occurrences = raw.occurrences.map(o => {
      if (!o.id || !/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !SHIFTS.includes(o.shift) || !ids.has(String(o.categoryId))) throw new Error("Há um compromisso com data, turno ou categoria inválidos.");
      return {id:String(o.id),date:o.date,shift:o.shift,categoryId:String(o.categoryId),
        status:["planned","completed","missed","cancelled"].includes(o.status)?o.status:"planned",
        note:String(o.note||"").slice(0,500),overridePriority:o.overridePriority==null?null:Math.max(1,Number(o.overridePriority)||1),
        protected:o.protected===true,createdAt:o.createdAt||new Date().toISOString(),updatedAt:o.updatedAt||new Date().toISOString(),
        legacy:o.legacy===true, disposition:o.disposition||"pending"};
    });
    return {version:2,categories,occurrences,changes:Array.isArray(raw.changes)?raw.changes.slice(-300):[]};
  }

  function loadData() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return validateData(JSON.parse(current));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = normalizeLegacy(JSON.parse(legacy));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.error("Falha ao carregar os dados do Ritmo:", error);
      state.loadError = "Não foi possível ler os dados salvos. Eles foram preservados; importe um backup válido ou recarregue a página.";
    }
    return emptyData();
  }

  const state = {
    data:null, view:"week", anchor:startOfWeek(new Date()), selectedDay:todayKey(),
    modal:null, editingId:null, editingCategoryId:null, toastTimer:null, theme:"dark",
    loadError:"", previousFocus:null
  };
  state.data = loadData();
  state.theme = localStorage.getItem(THEME_KEY)==="light" ? "light" : "dark";

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      return true;
    } catch (error) {
      console.error("Falha ao salvar os dados do Ritmo:", error);
      toast("Não foi possível salvar. Exporte um backup e libere espaço no navegador.");
      return false;
    }
  }
  function updateData(mutator) {
    const next = structuredClone(state.data);
    mutator(next);
    const previous = state.data;
    state.data = next;
    if (!persist()) { state.data = previous; render(); return false; }
    render();
    return true;
  }
  function toast(message) {
    const root=$("#toast-root"); root.innerHTML=`<div class="toast" role="status">${escapeHTML(message)}</div>`;
    clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>root.replaceChildren(),3400);
  }
  function category(id) { return state.data.categories.find(c=>c.id===id); }
  function occurrence(id) { return state.data.occurrences.find(o=>o.id===id); }
  function priorityOf(item) {
    if (item.overridePriority != null) return item.overridePriority;
    return category(item.categoryId)?.priority ?? 999;
  }
  function shiftOccurrences(date,shift,excludeId=null) {
    return state.data.occurrences.filter(o=>o.date===date&&o.shift===shift&&o.id!==excludeId&&o.status!=="cancelled");
  }
  function conflictsFor(date,shift,excludeId=null) {
    return shiftOccurrences(date,shift,excludeId).length;
  }
  function logChange(type,details) {
    state.data.changes.push({id:uid(),type,details,at:new Date().toISOString()});
    if(state.data.changes.length>300) state.data.changes=state.data.changes.slice(-300);
  }
  function setTheme() {
    state.theme=state.theme==="dark"?"light":"dark";
    document.documentElement.dataset.theme=state.theme;
    localStorage.setItem(THEME_KEY,state.theme);
    $("#theme-label").textContent=state.theme==="dark"?"Tema escuro":"Tema claro";
    render();
  }

  function render() {
    document.documentElement.dataset.theme=state.theme;
    $("#today-label").textContent=new Intl.DateTimeFormat("pt-BR",{weekday:"short",day:"numeric",month:"short"}).format(new Date());
    const labels={week:"Minha semana",month:"Calendário",categories:"Categorias"};
    $("#breadcrumb-current").textContent=labels[state.view];
    ["week","month","categories"].forEach(view=>{
      $(`#${view}-view`).hidden=state.view!==view;
    });
    $$("[data-view]").forEach(button=>button.classList.toggle("is-active",button.dataset.view===state.view));
    renderSidebar();
    if(state.view==="week") renderWeek();
    if(state.view==="month") renderMonth();
    if(state.view==="categories") renderCategories();
    $("#theme-label").textContent=state.theme==="dark"?"Tema escuro":"Tema claro";
    if(state.loadError) { toast(state.loadError); state.loadError=""; }
  }
  function renderSidebar() {
    const list=$("#sidebar-categories");
    const active=state.data.categories.filter(c=>c.active).sort((a,b)=>a.priority-b.priority);
    list.innerHTML=active.length?active.map(c=>`<button class="sidebar-category" data-action="filter-category" data-id="${escapeHTML(c.id)}"><i class="category-dot" style="background:${c.color}"></i>${escapeHTML(c.name)}</button>`).join(""):`<div class="sidebar-empty">Suas categorias aparecerão aqui.</div>`;
  }

  function weekDays(date) {
    const start=startOfWeek(date);
    return Array.from({length:7},(_,i)=>addDays(start,i));
  }

    function renderWeek() {
    const days=weekDays(state.anchor), start=dateKey(days[0]), end=dateKey(days[6]);
    const items=state.data.occurrences.filter(o=>o.date>=start&&o.date<=end&&o.status!=="cancelled");
    const planned=items.length, completed=items.filter(o=>o.status==="completed").length;
    const missed=items.filter(o=>o.status==="missed").length, pending=items.filter(o=>o.status==="planned").length;
    const activeCats=state.data.categories.filter(c=>c.active);
    const heading=`${new Intl.DateTimeFormat("pt-BR",{month:"long"}).format(days[0])} ${days[0].getFullYear()}`;
    $("#week-view").innerHTML=`
      <div class="page-heading">
        <div><span class="eyebrow">PLANEJAMENTO E ACOMPANHAMENTO</span><h1>Minha semana</h1><p>Organize seus turnos e ajuste o plano quando a realidade mudar.</p></div>
        <button class="primary-button" data-action="new-occurrence"><span>＋</span> Novo compromisso</button>
      </div>
      <div class="summary-grid">
        <article class="summary-card"><div class="summary-card-top">Compromissos <i class="summary-icon">▦</i></div><strong>${planned}</strong><small>Nesta semana</small></article>
        <article class="summary-card"><div class="summary-card-top">Realizados <i class="summary-icon">✓</i></div><strong>${completed}</strong><small>${planned?Math.round(completed/planned*100):0}% do planejado</small></article>
        <article class="summary-card"><div class="summary-card-top">Pendentes <i class="summary-icon">◷</i></div><strong>${pending}</strong><small>Ainda não acompanhados</small></article>
        <article class="summary-card"><div class="summary-card-top">Não realizados <i class="summary-icon">!</i></div><strong>${missed}</strong><small>Precisam de uma decisão</small></article>
      </div>
      <section class="planner-panel">
        <div class="planner-toolbar">
          <div class="period-control">
            <button class="icon-button" data-action="prev-period" aria-label="Semana anterior">‹</button>
            <h2>${escapeHTML(formatRange(start,end))}</h2>
            <button class="icon-button" data-action="next-period" aria-label="Próxima semana">›</button>
            <button class="today-button" data-action="go-today">Hoje</button>
          </div>
          <div class="view-switch"><button class="selected" type="button">Semana</button><button data-view="month" type="button">Mês</button></div>
        </div>
        <div class="mobile-day-picker">${days.map((day,i)=>{const key=dateKey(day);return `<button data-action="select-day" data-date="${key}" class="${key===state.selectedDay?"selected":""}"><span>${WEEKDAYS[i]}</span><strong>${day.getDate()}</strong></button>`}).join("")}</div>
        <div class="weekday-row">${WEEKDAYS.map(day=>`<span>${day.toUpperCase()}</span>`).join("")}</div>
        <div class="week-grid">${days.map(day=>renderDay(day)).join("")}</div>
        <div class="planner-footer"><span class="legend-item"><i class="legend-dot"></i> Planejado</span><span class="legend-item"><i class="legend-dot done"></i> Realizado</span><span class="legend-item"><i class="legend-dot missed"></i> Não realizado</span><span class="footer-note">Toque em um compromisso para acompanhar ou editar.</span></div>
      </section>
      <div class="insights-grid">
        <section class="insight-panel"><div class="panel-heading"><h3>Distribuição por categoria</h3><small>Turnos planejados nesta semana</small></div>${renderProgress(activeCats,items)}</section>
        <section class="insight-panel"><div class="panel-heading"><h3>Precisa de atenção</h3><small>Decisões em aberto</small></div>${renderAttention(items)}</section>
      </div>`;
  }

  function renderDay(day) {
    const key=dateKey(day), today=key===todayKey(), selected=key===state.selectedDay;
    const all=state.data.occurrences.filter(o=>o.date===key&&o.status!=="cancelled");
    const groups=SHIFTS.map(shift=>{
      const entries=all.filter(o=>o.shift===shift).sort((a,b)=>priorityOf(a)-priorityOf(b));
      const conflict=entries.length>1;
      return `<div class="shift-group">
        <div class="shift-label">${SHIFT_LABELS[shift].toUpperCase()}</div>
        <div class="shift-slot ${entries.length?"has-items":""} ${conflict?"conflict":""}">
          ${entries.map(item=>renderCommitment(item)).join("")}
          <button class="slot-add" data-action="new-occurrence" data-date="${key}" data-shift="${shift}">${entries.length?"+ Adicionar":"＋ Adicionar compromisso"}</button>
          ${conflict?`<div class="slot-footer"><span class="priority-mark">Conflito de turnos</span><button data-action="resolve-shift" data-date="${key}" data-shift="${shift}">Analisar →</button></div>`:""}
        </div>
      </div>`;
    }).join("");
    return `<article class="day-column ${today?"is-today":""} ${selected?"mobile-selected":""}" data-date="${key}">
      <div class="day-head"><strong>${day.getDate()}</strong></div><div class="day-items">${groups}</div></article>`;
  }

  function renderCommitment(item) {
    const cat=category(item.categoryId), color=cat?.color||"#8992a5";
    const statusLabel={planned:"Planejado",completed:"Realizado",missed:"Não realizado",cancelled:"Cancelado"}[item.status];
    const isDone=item.status==="completed", isMissed=item.status==="missed";
    return `<button class="commitment ${isDone?"is-completed":""} ${isMissed?"is-missed":""}" style="--cat:${color}" data-action="edit-occurrence" data-id="${escapeHTML(item.id)}">
      <span class="commitment-title">${escapeHTML(cat?.name||"Categoria removida")}${item.note?` · ${escapeHTML(item.note)}`:""}</span>
      <span class="commitment-meta"><span>${statusLabel}</span><span>${item.protected?"◆ Protegido":item.overridePriority!=null?"★ Prioritário":""}</span></span>
    </button>`;
  }

  function renderProgress(categories,items) {
    if(!categories.length) return `<div class="insight-empty">Crie categorias para acompanhar como seus turnos estão distribuídos.</div>`;
    return `<div class="progress-list">${categories.map(cat=>{
      const own=items.filter(o=>o.categoryId===cat.id), done=own.filter(o=>o.status==="completed").length;
      const goals=SHIFTS.reduce((sum,s)=>sum+(Number(cat.goals[s])||0),0);
      const pct=goals?Math.min(100,done/goals*100):0;
      return `<div class="progress-item"><div class="progress-meta"><span class="progress-name"><i class="category-dot" style="background:${cat.color}"></i>${escapeHTML(cat.name)}</span><span class="progress-value">${done} realizados · ${own.length} planejados${goals?` / meta ${goals}`:""}</span></div><div class="progress-track"><div class="progress-fill" style="--cat:${cat.color};--progress:${pct}%"></div></div></div>`;
    }).join("")}</div>`;
  }

  function renderAttention(items) {
    const missed=items.filter(o=>o.status==="missed");
    const conflicts=[];
    const bySlot=new Map();
    items.filter(o=>o.status!=="cancelled").forEach(o=>{const key=`${o.date}|${o.shift}`;bySlot.set(key,(bySlot.get(key)||0)+1);});
    bySlot.forEach((count,key)=>{if(count>1){const [date,shift]=key.split("|");conflicts.push({date,shift,count});}});
    const notices=[
      ...missed.map(o=>({title:`${category(o.categoryId)?.name||"Compromisso"} não realizado`,desc:`${formatDate(o.date)} · ${SHIFT_LABELS[o.shift]}. Decida se deseja redistribuir ou liberar esse período.`,id:o.id,action:"edit-occurrence"})),
      ...conflicts.map(c=>({title:"Mais de uma atividade no mesmo turno",desc:`${formatDate(c.date)} · ${SHIFT_LABELS[c.shift]}. Escolha o que deve prevalecer.`,date:c.date,shift:c.shift,action:"resolve-shift"}))
    ];
    if(!notices.length) return `<div class="insight-empty">Nenhuma pendência crítica identificada nesta semana. O espaço livre também faz parte do planejamento.</div>`;
    return `<div class="attention-list">${notices.slice(0,5).map(n=>`<button class="attention-item" style="width:100%;background:transparent;color:inherit;text-align:left" data-action="${n.action}" ${n.id?`data-id="${n.id}"`:`data-date="${n.date}" data-shift="${n.shift}"`}><i class="attention-indicator"></i><span><strong>${escapeHTML(n.title)}</strong><small>${escapeHTML(n.desc)}</small></span></button>`).join("")}</div>`;
  }

  function renderMonth() {
    const anchor=state.anchor, first=new Date(anchor.getFullYear(),anchor.getMonth(),1,12), last=new Date(anchor.getFullYear(),anchor.getMonth()+1,0,12);
    const gridStart=startOfWeek(first), gridEnd=addDays(startOfWeek(last),6);
    const days=[];for(let d=gridStart;d<=gridEnd;d=addDays(d,1))days.push(d);
    $("#month-view").innerHTML=`
      <div class="page-heading"><div><span class="eyebrow">VISÃO GERAL</span><h1>Calendário</h1><p>Enxergue a distribuição dos seus compromissos ao longo do mês.</p></div><button class="primary-button" data-action="new-occurrence"><span>＋</span> Novo compromisso</button></div>
      <section class="planner-panel">
        <div class="planner-toolbar"><div class="period-control"><button class="icon-button" data-action="prev-month" aria-label="Mês anterior">‹</button><h2>${escapeHTML(monthLabel(anchor))}</h2><button class="icon-button" data-action="next-month" aria-label="Próximo mês">›</button><button class="today-button" data-action="go-today">Hoje</button></div><div class="view-switch"><button data-view="week">Semana</button><button class="selected">Mês</button></div></div>
        <div class="month-grid"><div class="month-weekdays">${WEEKDAYS.map(d=>`<span>${d.toUpperCase()}</span>`).join("")}</div>
        <div class="month-days">${days.map(day=>{
          const key=dateKey(day), own=state.data.occurrences.filter(o=>o.date===key&&o.status!=="cancelled"), inMonth=day.getMonth()===anchor.getMonth();
          return `<div class="month-day ${inMonth?"":"outside"} ${key===todayKey()?"today":""}"><button class="month-day-number" data-action="select-month-day" data-date="${key}" aria-label="Ver ${formatDate(key)}">${day.getDate()}</button><div class="month-events">${own.slice(0,3).map(o=>`<button class="month-event" style="--cat:${category(o.categoryId)?.color||"#8992a5"}" data-action="edit-occurrence" data-id="${o.id}">${escapeHTML(category(o.categoryId)?.name||"Compromisso")} · ${SHIFT_LABELS[o.shift]}</button>`).join("")}${own.length>3?`<span class="month-more">+${own.length-3} outros</span>`:""}</div></div>`;
        }).join("")}</div></div>
      </section>`;
  }

  function renderCategories() {
    const cats=[...state.data.categories].sort((a,b)=>a.priority-b.priority);
    $("#categories-view").innerHTML=`
      <div class="page-heading"><div><span class="eyebrow">ORGANIZAÇÃO DO SEU TEMPO</span><h1>Categorias</h1><p>Defina o que importa e quanto espaço cada área precisa na sua rotina.</p></div><button class="primary-button" data-action="new-category"><span>＋</span> Nova categoria</button></div>
      <div class="category-order-note"><strong>Hierarquia de prioridades</strong><br>Quanto menor o número, maior a prioridade global. Cada posição pertence a uma única categoria. Uma ocorrência pode receber prioridade excepcional sem alterar esta ordem.</div>
      ${cats.length?`<div class="category-grid">${cats.map(c=>`
        <article class="category-card ${c.active?"":"is-inactive"}" style="--cat:${c.color}">
          <div class="category-card-top"><span class="category-badge"><i></i>${escapeHTML(c.name)}</span><span class="category-rank">Prioridade ${c.priority}</span></div>
          <p>${c.active?"Categoria ativa no planejamento.":"Categoria arquivada; compromissos antigos foram preservados."} ${c.defaultProtected?"Novos compromissos começam protegidos.":""}</p>
          <div class="category-goals">${SHIFTS.map(s=>`<span class="goal-chip">${SHIFT_LABELS[s]}: ${c.goals[s]||0} ${c.goals[s]===1?"turno":"turnos"}</span>`).join("")}</div>
          <div class="category-actions"><button class="secondary-button" data-action="edit-category" data-id="${c.id}">Editar</button><button class="secondary-button" data-action="move-priority" data-id="${c.id}" data-direction="up" ${c.priority===1?"disabled":""}>↑ Prioridade</button><button class="secondary-button" data-action="move-priority" data-id="${c.id}" data-direction="down" ${c.priority===cats.length?"disabled":""}>↓</button>${c.active?`<button class="danger-button" data-action="archive-category" data-id="${c.id}">Arquivar</button>`:`<button class="secondary-button" data-action="restore-category" data-id="${c.id}">Reativar</button>`}</div>
        </article>`).join("")}</div>`:`<section class="content-panel"><div class="empty-state"><strong>Comece pelas áreas da sua vida</strong><p>Crie categorias como trabalho, estudos, igreja, descanso ou lazer. Depois distribua seus turnos.</p><button class="primary-button" data-action="new-category">Criar primeira categoria</button></div></section>`}`;
  }

    function openModal(content,wide=false) {
    state.previousFocus=document.activeElement;
    $("#modal-root").innerHTML=`<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide?"wide":""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${content}</section></div>`;
    const first=$("input,select,textarea,button",$("#modal-root")); if(first) first.focus();
  }
  function closeModal() {
    $("#modal-root").replaceChildren(); state.modal=null; state.editingId=null; state.editingCategoryId=null;
    if(state.previousFocus?.isConnected) state.previousFocus.focus();
  }
  function modalHeader(title,description) {
    return `<header class="modal-head"><div><h2 id="modal-title">${title}</h2><p>${description}</p></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header>`;
  }

  function openOccurrenceForm(id=null, date=todayKey(), shift="morning") {
    if(!state.data.categories.some(c=>c.active)) { toast("Crie uma categoria antes de adicionar compromissos."); state.view="categories";render();return; }
    const item=id?occurrence(id):null; state.modal="occurrence";state.editingId=id;
    const cats=state.data.categories.filter(c=>c.active).sort((a,b)=>a.priority-b.priority);
    const current=item||{date,shift,categoryId:cats[0].id,status:"planned",note:"",overridePriority:null,protected:category(cats[0].id)?.defaultProtected||false};
    const categoryOptions=cats.map(c=>`<option value="${c.id}" ${c.id===current.categoryId?"selected":""}>${escapeHTML(c.name)} · prioridade ${c.priority}</option>`).join("");
    openModal(`${modalHeader(item?"Editar compromisso":"Novo compromisso",item?"Atualize o que aconteceu ou reorganize este turno.":"Escolha a categoria, o dia e o período. Não é necessário definir horários.")}
      <form id="occurrence-form" novalidate>
        <div class="form-grid">
          <div class="field full"><label for="occ-category">Categoria</label><select id="occ-category" name="categoryId" required>${categoryOptions}</select></div>
          <div class="field full"><span class="field-label">Período</span><div class="shift-options">${SHIFTS.map(s=>`<label class="shift-option"><input type="radio" name="shift" value="${s}" ${current.shift===s?"checked":""}><span>${SHIFT_LABELS[s]}</span></label>`).join("")}</div></div>
          <div class="field full"><label for="occ-date">Data</label><input id="occ-date" name="date" type="date" value="${current.date}" required></div>
          <div class="field full"><label for="occ-status">Acompanhamento</label><select id="occ-status" name="status"><option value="planned" ${current.status==="planned"?"selected":""}>Planejado</option><option value="completed" ${current.status==="completed"?"selected":""}>Realizado</option><option value="missed" ${current.status==="missed"?"selected":""}>Não realizado</option><option value="cancelled" ${current.status==="cancelled"?"selected":""}>Cancelado / liberado</option></select></div>
          <div class="field full"><label for="occ-note">Observação <span class="field-help">(opcional)</span></label><textarea id="occ-note" name="note" maxlength="500" placeholder="Algum detalhe importante?">${escapeHTML(current.note||"")}</textarea></div>
          <div class="field full"><label class="toggle-row"><input type="checkbox" name="override" ${current.overridePriority!=null?"checked":""}><span><strong>Prioridade excepcional nesta ocorrência</strong><small>Não altera a prioridade global da categoria. Use quando este compromisso específico precisar prevalecer.</small></span></label></div>
          <div class="field full" id="override-field" ${current.overridePriority==null?"hidden":""}><label for="occ-priority">Prioridade excepcional</label><input id="occ-priority" name="overridePriority" type="number" min="1" max="99" value="${current.overridePriority??1}"><small class="field-help">1 é a prioridade máxima nesta ocorrência.</small></div>
          <div class="field full"><label class="toggle-row"><input type="checkbox" name="protected" ${current.protected?"checked":""}><span><strong>Proteger este compromisso</strong><small>O Ritmo não deve sugerir deslocá-lo automaticamente.</small></span></label></div>
        </div>
        <div class="form-error" id="occ-error"></div>
        <footer class="modal-actions">${item?`<button class="danger-button" type="button" data-action="delete-occurrence" data-id="${item.id}">Excluir</button>`:""}<div class="modal-actions-right"><button class="secondary-button" type="button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${item?"Salvar alterações":"Salvar compromisso"}</button></div></footer>
      </form>`,true);
    const override=$('input[name="override"]',$("#modal-root"));
    override.addEventListener("change",()=>$("#override-field").hidden=!override.checked);
    $("#occurrence-form").addEventListener("submit",saveOccurrenceForm);
  }

  function saveOccurrenceForm(event) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const values={categoryId:String(form.get("categoryId")),shift:String(form.get("shift")),date:String(form.get("date")),status:String(form.get("status")),note:String(form.get("note")||"").trim(),overridePriority:form.get("override")?Math.max(1,Number(form.get("overridePriority"))||1):null,protected:form.get("protected")==="on"};
    const error=$("#occ-error");
    if(!values.categoryId||!SHIFTS.includes(values.shift)||!/^\d{4}-\d{2}-\d{2}$/.test(values.date)||!category(values.categoryId)?.active){error.textContent="Confira a categoria, a data e o período.";return;}
    const editing=state.editingId, now=new Date().toISOString();
    const other=shiftOccurrences(values.date,values.shift,editing).filter(o=>o.status!=="cancelled");
    const commit=updateData(data=>{
      if(editing) data.occurrences=data.occurrences.map(o=>o.id===editing?{...o,...values,updatedAt:now}:o);
      else data.occurrences.push({id:uid(),...values,createdAt:now,updatedAt:now,disposition:"pending"});
      logChange(editing?"occurrence_updated":"occurrence_created",{id:editing||"new",date:values.date,shift:values.shift});
    });
    if(commit){closeModal();state.selectedDay=values.date;state.anchor=startOfWeek(parseDate(values.date));render();if(other.length)toast("Compromisso salvo. Há outro compromisso neste turno; analise o conflito.");}
  }

  function openCategoryForm(id=null) {
    const item=id?category(id):null;state.modal="category";state.editingCategoryId=id;
    const current=item||{name:"",color:PALETTE[state.data.categories.length%PALETTE.length],priority:state.data.categories.length+1,goals:{morning:0,afternoon:0,night:0},defaultProtected:false};
    openModal(`${modalHeader(item?"Editar categoria":"Nova categoria","Categorias definem a prioridade habitual e a meta de ocupação de cada turno.")}
      <form id="category-form" novalidate><div class="form-grid">
        <div class="field full"><label for="cat-name">Nome</label><input id="cat-name" name="name" maxlength="60" required value="${escapeHTML(current.name)}" placeholder="Ex.: Trabalho, Estudos, Igreja"></div>
        <div class="field"><label for="cat-color">Cor</label><input id="cat-color" name="color" type="color" value="${current.color}"></div>
        <div class="field"><label for="cat-priority">Prioridade global</label><input id="cat-priority" name="priority" type="number" min="1" max="${Math.max(99,state.data.categories.length+1)}" value="${current.priority}" required><small class="field-help">Posição única. 1 é a mais alta.</small></div>
        <div class="field full"><span class="field-label">Meta de turnos por semana</span><div class="form-grid">${SHIFTS.map(s=>`<div class="field"><label for="goal-${s}">${SHIFT_LABELS[s]}</label><input id="goal-${s}" name="goal-${s}" type="number" min="0" max="21" value="${current.goals[s]||0}"></div>`).join("")}</div><small class="field-help">A meta é uma referência de distribuição, não uma obrigação de ocupar todo o tempo livre.</small></div>
        <div class="field full"><label class="toggle-row"><input type="checkbox" name="defaultProtected" ${current.defaultProtected?"checked":""}><span><strong>Proteger novos compromissos desta categoria por padrão</strong><small>Você ainda pode alterar a proteção em cada ocorrência.</small></span></label></div>
      </div><div class="form-error" id="cat-error"></div><footer class="modal-actions"><div></div><div class="modal-actions-right"><button class="secondary-button" type="button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Salvar categoria</button></div></footer></form>`);
    $("#category-form").addEventListener("submit",saveCategoryForm);
  }

  function saveCategoryForm(event) {
    event.preventDefault();const form=new FormData(event.currentTarget), name=String(form.get("name")||"").trim();
    const priority=Math.max(1,Number(form.get("priority"))||1), editing=state.editingCategoryId;
    const error=$("#cat-error");
    if(!name){error.textContent="Informe um nome para a categoria.";return;}
    const duplicate=state.data.categories.find(c=>c.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&c.id!==editing);
    if(duplicate){error.textContent="Já existe uma categoria com esse nome.";return;}
    const max=state.data.categories.length+(editing?0:1);
    if(priority>max){error.textContent=`Escolha uma posição entre 1 e ${max}.`;return;}
    const values={name,color:String(form.get("color")),priority,goals:{morning:Number(form.get("goal-morning"))||0,afternoon:Number(form.get("goal-afternoon"))||0,night:Number(form.get("goal-night"))||0},defaultProtected:form.get("defaultProtected")==="on"};
    const ok=updateData(data=>{
      if(editing){
        const old=data.categories.find(c=>c.id===editing), oldPriority=old.priority;
        data.categories.forEach(c=>{if(c.id===editing)return;if(priority<oldPriority&&c.priority>=priority&&c.priority<oldPriority)c.priority++;else if(priority>oldPriority&&c.priority<=priority&&c.priority>oldPriority)c.priority--;});
        Object.assign(old,values);
      }else{
        data.categories.forEach(c=>{if(c.priority>=priority)c.priority++;});
        data.categories.push({id:uid(),...values,active:true});
      }
      logChange(editing?"category_updated":"category_created",{name});
    });
    if(ok){closeModal();render();toast("Categoria salva. A hierarquia foi atualizada.");}
  }

  function movePriority(id,direction) {
    updateData(data=>{
      const current=data.categories.find(c=>c.id===id);if(!current)return;
      const targetPriority=current.priority+(direction==="up"?-1:1);
      const other=data.categories.find(c=>c.priority===targetPriority);
      if(!other)return;
      other.priority=current.priority;current.priority=targetPriority;
      logChange("priority_reordered",{category:id,position:targetPriority});
    });
  }

  function resolveShift(date,shift) {
    const items=shiftOccurrences(date,shift).sort((a,b)=>priorityOf(a)-priorityOf(b));
    if(items.length<2){toast("Não há conflito neste turno.");return;}
    const winner=items[0];
    const list=items.map((item,index)=>`<div class="suggestion-card"><div><strong>${escapeHTML(category(item.categoryId)?.name||"Compromisso")} ${index===0?"· maior prioridade":""}</strong><small>${item.protected?"Protegido":item.overridePriority!=null?`Prioridade excepcional ${item.overridePriority}`:`Prioridade global ${priorityOf(item)}`}</small></div><button class="${index===0?"secondary-button":"primary-button"}" data-action="edit-occurrence" data-id="${item.id}">${index===0?"Editar":"Decidir"}</button></div>`).join("");
    openModal(`${modalHeader("Conflito de turno",`${formatDate(date)} · ${SHIFT_LABELS[shift]}. Mais de uma atividade foi planejada para o mesmo período.`)}
      <p class="field-help">A prioridade efetiva ajuda a identificar uma preferência, mas não cancela os outros compromissos automaticamente. Decida se cada atividade será redistribuída ou liberada.</p>
      <div class="suggestion-list">${list}</div>
      <footer class="modal-actions"><div></div><div class="modal-actions-right"><button class="secondary-button" data-action="close-modal">Fechar</button></div></footer>`,true);
  }

  function openRedistribute(id) {
    const item=occurrence(id);if(!item)return;
    if(item.protected){toast("Este compromisso está protegido. Remova a proteção antes de redistribuí-lo.");return;}
    const options=[];
    const base=parseDate(item.date);
    for(let offset=1;offset<=21;offset++){
      const date=dateKey(addDays(base,offset));
      for(const shift of SHIFTS){
        if(date===item.date&&shift===item.shift)continue;
        const occupants=shiftOccurrences(date,shift,id);
        if(!occupants.length) options.push({date,shift,kind:"livre"});
        else if(occupants.every(o=>priorityOf(o)>priorityOf(item)&&!o.protected)) options.push({date,shift,kind:"ocupado"});
      }
    }
    const suggestions=options.slice(0,8);
    if(!suggestions.length){toast("Não encontrei um turno livre ou claramente flexível nas próximas três semanas.");return;}
    openModal(`${modalHeader("Redistribuir compromisso",`Escolha um novo período para ${category(item.categoryId)?.name||"esta atividade"}. O original será preservado no histórico.`)}
      <div class="suggestion-list">${suggestions.map(s=>`<div class="suggestion-card"><div><strong>${new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"short"}).format(parseDate(s.date))} · ${SHIFT_LABELS[s.shift]}</strong><small>${s.kind==="livre"?"Turno livre":"Já existe uma atividade de prioridade inferior"}</small></div><button class="primary-button" data-action="confirm-reschedule" data-id="${item.id}" data-date="${s.date}" data-shift="${s.shift}">Escolher</button></div>`).join("")}</div>
      <footer class="modal-actions"><div></div><div class="modal-actions-right"><button class="secondary-button" data-action="close-modal">Cancelar</button></div></footer>`,true);
  }

    function confirmReschedule(id,date,shift) {
    const item=occurrence(id);if(!item)return;
    if(item.protected){closeModal();toast("O compromisso está protegido e não foi deslocado.");return;}
    if(shiftOccurrences(date,shift).length && shiftOccurrences(date,shift).some(o=>priorityOf(o)<=priorityOf(item)||o.protected)){toast("Esse turno mudou e não está mais disponível. Escolha outro.");return;}
    const now=new Date().toISOString();
    const oldDate=item.date,oldShift=item.shift;
    const ok=updateData(data=>{
      const original=data.occurrences.find(o=>o.id===id);
      original.status="missed";original.disposition="rescheduled";original.updatedAt=now;
      data.occurrences.push({...structuredClone(original),id:uid(),date,shift,status:"planned",createdAt:now,updatedAt:now,disposition:"rescheduled",note:original.note});
      logChange("occurrence_rescheduled",{id,from:{date:oldDate,shift:oldShift},to:{date,shift}});
    });
    if(ok){closeModal();state.view="week";state.anchor=startOfWeek(parseDate(date));state.selectedDay=date;render();toast("Redistribuição registrada. O período original continua no histórico.");}
  }

  function deleteOccurrence(id) {
    const item=occurrence(id);if(!item)return;
    if(!confirm("Excluir este compromisso permanentemente? Para apenas liberar o período, altere o acompanhamento para “Cancelado / liberado”."))return;
    const ok=updateData(data=>{data.occurrences=data.occurrences.filter(o=>o.id!==id);logChange("occurrence_deleted",{id});});
    if(ok){closeModal();toast("Compromisso excluído.");}
  }
  function archiveCategory(id,active) {
    const c=category(id);if(!c)return;
    updateData(data=>{const target=data.categories.find(x=>x.id===id);target.active=active;logChange(active?"category_restored":"category_archived",{id});});
    toast(active?"Categoria reativada.":"Categoria arquivada. Os compromissos antigos foram preservados.");
  }

  function exportBackup() {
    const blob=new Blob([JSON.stringify(state.data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`ritmo-backup-${todayKey()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast("Backup exportado.");
  }
  function importBackup() {
    const input=document.createElement("input");input.type="file";input.accept="application/json,.json";
    input.addEventListener("change",async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const parsed=JSON.parse(await file.text()),validated=validateData(parsed);
        if(!confirm(`O backup contém ${validated.categories.length} categorias e ${validated.occurrences.length} compromissos. Substituir os dados atuais?`))return;
        const previous=state.data;state.data=validated;
        if(!persist()){state.data=previous;return;}
        render();toast("Backup restaurado com sucesso.");
      }catch(error){toast(error.message||"Não foi possível importar esse arquivo.");}
    });input.click();
  }

  function handleAction(action,target) {
    const id=target.dataset.id,date=target.dataset.date,shift=target.dataset.shift;
    switch(action){
      case "new-occurrence":openOccurrenceForm(null,date||state.selectedDay||todayKey(),shift||"morning");break;
      case "edit-occurrence":openOccurrenceForm(id);break;
      case "new-category":openCategoryForm();break;
      case "edit-category":openCategoryForm(id);break;
      case "close-modal":closeModal();break;
      case "delete-occurrence":deleteOccurrence(id);break;
      case "prev-period":state.anchor=addDays(state.anchor,-7);state.selectedDay=dateKey(state.anchor);render();break;
      case "next-period":state.anchor=addDays(state.anchor,7);state.selectedDay=dateKey(state.anchor);render();break;
      case "prev-month":state.anchor=new Date(state.anchor.getFullYear(),state.anchor.getMonth()-1,1,12);render();break;
      case "next-month":state.anchor=new Date(state.anchor.getFullYear(),state.anchor.getMonth()+1,1,12);render();break;
      case "go-today":state.anchor=state.view==="month"?new Date():startOfWeek(new Date());state.selectedDay=todayKey();render();break;
      case "select-day":state.selectedDay=date;renderWeek();break;
      case "select-month-day":state.anchor=startOfWeek(parseDate(date));state.selectedDay=date;state.view="week";render();break;
      case "resolve-shift":resolveShift(date,shift);break;
      case "move-priority":movePriority(id,target.dataset.direction);break;
      case "archive-category":if(confirm("Arquivar esta categoria? Os compromissos já registrados serão preservados."))archiveCategory(id,false);break;
      case "restore-category":archiveCategory(id,true);break;
      case "backup":exportBackup();break;
      case "import-backup":importBackup();break;
      case "theme":setTheme();break;
      case "redistribute":openRedistribute(id);break;
      case "confirm-reschedule":confirmReschedule(id,date,shift);break;
      case "filter-category":state.view="week";render();toast("Use a lista da semana para visualizar os compromissos desta categoria.");break;
    }
  }

  document.addEventListener("click",event=>{
    const viewButton=event.target.closest("[data-view]");
    if(viewButton){event.preventDefault();state.view=viewButton.dataset.view;render();return;}
    const actionTarget=event.target.closest("[data-action]");
    if(!actionTarget)return;
    const action=actionTarget.dataset.action;
    if(action==="backdrop"&&event.target===actionTarget){closeModal();return;}
    handleAction(action,actionTarget);
  });

  document.addEventListener("submit",event=>{
    if(event.target.id==="occurrence-form")saveOccurrenceForm(event);
    if(event.target.id==="category-form")saveCategoryForm(event);
  });
  document.addEventListener("change",event=>{
    if(event.target.matches('input[name="override"]'))$("#override-field").hidden=!event.target.checked;
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&$("#modal-root .modal"))closeModal();
  });

  // A ação de redistribuir fica disponível no formulário quando o compromisso não foi realizado.
  const originalOpenOccurrenceForm=openOccurrenceForm;
  openOccurrenceForm=function(id=null,date=todayKey(),shift="morning"){
    originalOpenOccurrenceForm(id,date,shift);
    if(id){
      const item=occurrence(id);
      if(item&&item.status==="missed"&&!item.protected){
        const actions=$(".modal-actions",$("#modal-root"));
        if(actions){
          const button=document.createElement("button");button.type="button";button.className="secondary-button";button.textContent="Redistribuir";
          button.addEventListener("click",()=>openRedistribute(id));
          actions.insertBefore(button,actions.firstChild);
        }
      }
    }
  };

  render();
})();

