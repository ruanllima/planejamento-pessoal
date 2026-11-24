import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2, Clock3, Check, CircleCheck, Download, LayoutGrid, CalendarRange, X, Trash2, Tag, ArrowUpRight, Sun, Moon } from 'lucide-react'
import type { Category, PlannerData, Priority, TimeBlock, BlockStatus } from './domain/types'
import { addDays, dateKey, formatDuration, formatRange, monthGrid, monthLabel, weekDays } from './domain/date'
import { blockDuration, summarize, validateBlock } from './domain/planner'
import { exportBackup, loadData, saveData } from './data/storage'

const priorityLabel: Record<Priority,string> = {critical:'Crítica', high:'Alta', medium:'Média', flexible:'Flexível'}
const weekNames = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']
const uid = () => crypto.randomUUID()
type Theme = 'dark' | 'light'
const THEME_KEY = 'ritmo.theme.v1'
function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

export default function App() {
  const [data,setData] = useState<PlannerData>(() => loadData())
  const [theme,setTheme] = useState<Theme>(() => loadTheme())
  const [anchor,setAnchor] = useState(new Date())
  const [view,setView] = useState<'week'|'month'>('week')
  const [modal,setModal] = useState<'block'|'category'|null>(null)
  const [editing,setEditing] = useState<TimeBlock|null>(null)
  const [selectedDate,setSelectedDate] = useState(dateKey(new Date()))
  const [toast,setToast] = useState('')
  const [showCategories,setShowCategories] = useState(false)

  useEffect(() => { try { saveData(data) } catch { setToast('Não foi possível salvar. Exporte uma cópia dos seus dados.') } },[data])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) themeColor.content = theme === 'dark' ? '#17191f' : '#f7f8fa'
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* A preferência continua aplicada nesta sessão. */ }
  }, [theme])
  useEffect(() => { if (!toast) return; const t=setTimeout(()=>setToast(''),3200); return ()=>clearTimeout(t) },[toast])

  const days = useMemo(()=>weekDays(anchor),[anchor])
  const rangeStart = dateKey(days[0]), rangeEnd = dateKey(days[6])
  const summary = summarize(data,rangeStart,rangeEnd)
  const activeCategories = data.categories.filter(c=>c.active)
  const getCategory = (id:string) => data.categories.find(c=>c.id===id)
  const blocksFor = (day:Date) => data.blocks.filter(b=>b.date===dateKey(day)).sort((a,b)=>a.start.localeCompare(b.start))
  const openNewBlock = (date=dateKey(new Date())) => { setSelectedDate(date); setEditing(null); setModal('block') }

  function saveBlock(values: Omit<TimeBlock,'id'|'createdAt'|'updatedAt'>) {
    const error=validateBlock(values,data.blocks,editing?.id)
    if(error){setToast(error);return}
    const now=new Date().toISOString()
    if(editing) setData(d=>({...d,blocks:d.blocks.map(b=>b.id===editing.id?{...b,...values,updatedAt:now}:b)}))
    else setData(d=>({...d,blocks:[...d.blocks,{...values,id:uid(),createdAt:now,updatedAt:now}]}))
    setModal(null);setEditing(null);setToast(editing?'Compromisso atualizado':'Compromisso adicionado')
  }
  function updateStatus(block:TimeBlock,status:BlockStatus) {
    setData(d=>({...d,blocks:d.blocks.map(b=>b.id===block.id?{...b,status,updatedAt:new Date().toISOString()}:b)}))
  }
  function saveCategory(name:string,color:string,priority:Priority,goal:number,protectedItem:boolean) {
    if(!name.trim()){setToast('Informe o nome da categoria.');return}
    setData(d=>({...d,categories:[...d.categories,{id:uid(),name:name.trim(),color,priority,weeklyGoalMinutes:goal,protected:protectedItem,active:true}]}))
    setModal(null);setToast('Categoria criada')
  }
  function removeBlock(id:string){setData(d=>({...d,blocks:d.blocks.filter(b=>b.id!==id)}));setModal(null);setToast('Compromisso excluído')}
  function addCategoryFromModal(name:string,color:string,priority:Priority,goal:number,protectedItem:boolean){saveCategory(name,color,priority,goal,protectedItem)}

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><CalendarRange size={18}/></div><span>ritmo</span></div>
      <div className="workspace-label">ESPAÇO PESSOAL</div>
      <button className={`nav-item ${view==='week'?'active':''}`} onClick={()=>setView('week')}><CalendarDays size={17}/> Minha semana</button>
      <button className={`nav-item ${view==='month'?'active':''}`} onClick={()=>setView('month')}><LayoutGrid size={17}/> Calendário</button>
      <div className="side-divider"/>
      <div className="side-section-head"><span>CATEGORIAS</span><button aria-label="Nova categoria" onClick={()=>setModal('category')}><Plus size={16}/></button></div>
      <div className="category-list">
        {activeCategories.map(c=><button className="category-item" key={c.id} onClick={()=>setShowCategories(true)}><i style={{background:c.color}}/><span>{c.name}</span></button>)}
        {!activeCategories.length&&<p className="side-empty">Suas categorias aparecerão aqui.</p>}
      </div>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={()=>setShowCategories(true)}><Settings2 size={17}/> Gerenciar categorias</button>
        <button className="nav-item" onClick={()=>exportBackup(data)}><Download size={17}/> Exportar backup</button>
        <div className="local-note"><span className="status-dot"/> Armazenamento neste dispositivo</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="breadcrumb">Planejamento <span>/</span> <strong>{view==='week'?'Minha semana':'Calendário'}</strong></div>
        <div className="top-actions"><span className="today-label">{new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</span><button className="icon-button theme-toggle" title={theme==='dark'?'Ativar tema claro':'Ativar tema escuro'} aria-label={theme==='dark'?'Ativar tema claro':'Ativar tema escuro'} onClick={()=>setTheme(current=>current==='dark'?'light':'dark')}><span className="theme-toggle-label">{theme==='dark'?'Claro':'Escuro'}</span>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button><button className="icon-button" title="Exportar backup" aria-label="Exportar backup" onClick={()=>exportBackup(data)}><Download size={17}/></button></div>
      </header>

      <section className="page-content">
        <div className="page-heading">
          <div><div className="eyebrow">VISÃO GERAL</div><h1>{view==='week'?'Sua semana':'Seu calendário'}</h1><p>{view==='week'?'Uma visão clara do que está planejado e do que aconteceu.':'Encontre seus compromissos ao longo dos meses.'}</p></div>
          <button className="primary-button" onClick={()=>openNewBlock()}><Plus size={17}/> Novo compromisso</button>
        </div>

        <div className="summary-grid">
          <SummaryCard label="Planejado" value={formatDuration(summary.planned)} icon={<CalendarDays size={17}/>} caption={`${data.blocks.filter(b=>b.date>=rangeStart&&b.date<=rangeEnd).length} compromissos na semana`}/>
          <SummaryCard label="Realizado" value={formatDuration(summary.completed)} icon={<CircleCheck size={17}/>} caption={summary.planned?`${Math.round(summary.completed/summary.planned*100)}% do planejado`:'Aguardando registros'}/>
          <SummaryCard label="Pendente" value={formatDuration(summary.pending)} icon={<Clock3 size={17}/>} caption="Planejado que ainda não foi concluído"/>
        </div>

        <div className="planner-panel">
          <div className="planner-toolbar">
            <div className="period-control"><button className="icon-button" aria-label="Período anterior" onClick={()=>setAnchor(d=>addDays(d,view==='week'?-7:-30))}><ChevronLeft size={18}/></button><h2>{view==='week'?formatRange(days):monthLabel(anchor)}</h2><button className="icon-button" aria-label="Próximo período" onClick={()=>setAnchor(d=>addDays(d,view==='week'?7:30))}><ChevronRight size={18}/></button><button className="today-button" onClick={()=>setAnchor(new Date())}>Hoje</button></div>
            <div className="view-switch"><button className={view==='week'?'selected':''} onClick={()=>setView('week')}>Semana</button><button className={view==='month'?'selected':''} onClick={()=>setView('month')}>Mês</button></div>
          </div>
          {view==='week'?<div className="week-grid">
            {days.map((day,i)=>{const key=dateKey(day),items=blocksFor(day),today=key===dateKey(new Date());return <div className={`day-column ${today?'is-today':''}`} key={key}>
              <div className="day-head"><span>{weekNames[i]}</span><strong>{day.getDate()}</strong></div>
              <div className="day-items">
                {items.map(block=><BlockCard key={block.id} block={block} category={getCategory(block.categoryId)} onClick={()=>{setEditing(block);setSelectedDate(block.date);setModal('block')}}/>)}
                {!items.length&&<button className="day-empty" onClick={()=>openNewBlock(key)}><Plus size={14}/><span>Adicionar</span></button>}
              </div>
              {!!items.length&&<button className="add-inline" aria-label={`Adicionar em ${key}`} onClick={()=>openNewBlock(key)}><Plus size={15}/></button>}
            </div>})}
          </div>:<MonthView date={anchor} data={data} onSelect={d=>{setAnchor(d);setSelectedDate(dateKey(d));setView('week')}} onAdd={d=>openNewBlock(dateKey(d))}/>}
          <div className="planner-footer"><span><i className="legend-dot planned"/> Planejado</span><span><i className="legend-dot completed"/> Realizado</span><span><i className="legend-dot missed"/> Não realizado</span><span className="footer-hint">Selecione um compromisso para editar</span></div>
        </div>

        <div className="bottom-grid">
          <section className="insight-card"><div className="card-title"><div><span className="eyebrow">ACOMPANHAMENTO</span><h3>Ritmo da semana</h3></div><ArrowUpRight size={18}/></div>
            {activeCategories.length?activeCategories.map(c=>{const total=data.blocks.filter(b=>b.categoryId===c.id&&b.date>=rangeStart&&b.date<=rangeEnd);const done=total.filter(b=>b.status==='completed').reduce((s,b)=>s+blockDuration(b),0);const goal=c.weeklyGoalMinutes;const pct=goal?Math.min(100,done/goal*100):0;return <div className="progress-row" key={c.id}><div className="progress-meta"><span><i style={{background:c.color}}/>{c.name}</span><small>{formatDuration(done)}{goal?` / ${formatDuration(goal)}`:' realizados'}</small></div><div className="progress-track"><div style={{width:`${pct}%`,background:c.color}}/></div></div>}):<div className="empty-insight"><Tag size={20}/><p>Crie categorias para acompanhar como seu tempo está distribuído.</p><button onClick={()=>setModal('category')}>Criar categoria</button></div>}
          </section>
          <section className="insight-card focus-card"><span className="eyebrow">PRÓXIMO PASSO</span><h3>Comece pelo que importa.</h3><p>Adicione suas categorias e compromissos. Com o uso, esta área ajudará você a perceber pendências e reorganizar sua semana.</p><button className="text-button" onClick={()=>setModal('category')}>Configurar categorias <ArrowUpRight size={15}/></button></section>
        </div>
      </section>
    </main>

    {modal==='block'&&<BlockModal categories={activeCategories} block={editing} date={selectedDate} onClose={()=>setModal(null)} onSave={saveBlock} onDelete={removeBlock} onAddCategory={()=>setModal('category')}/>}
    {modal==='category'&&<CategoryModal onClose={()=>setModal(null)} onSave={addCategoryFromModal}/>}
    {showCategories&&<CategoryManager categories={data.categories} onClose={()=>setShowCategories(false)} onArchive={id=>setData(d=>({...d,categories:d.categories.map(c=>c.id===id?{...c,active:false}:c)}))} onRestore={id=>setData(d=>({...d,categories:d.categories.map(c=>c.id===id?{...c,active:true}:c)}))}/>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  </div>
}

function SummaryCard({label,value,icon,caption}:{label:string,value:string,icon:React.ReactNode,caption:string}){return <div className="summary-card"><div className="summary-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{caption}</small></div>}
function BlockCard({block,category,onClick}:{block:TimeBlock,category?:Category,onClick:()=>void}){return <button className={`block-card ${block.status}`} style={{'--block-color':category?.color||'#9ca3af'} as React.CSSProperties} onClick={onClick}><span className="block-time">{block.start} – {block.end}</span><strong>{category?.name||'Categoria removida'}</strong><span className="block-duration">{formatDuration(blockDuration(block))}</span>{block.status==='completed'&&<Check size={13} className="block-check"/>}</button>}
function MonthView({date,data,onSelect,onAdd}:{date:Date,data:PlannerData,onSelect:(d:Date)=>void,onAdd:(d:Date)=>void}){const cells=monthGrid(date);return <div className="month-view"><div className="month-weekdays">{weekNames.map(n=><span key={n}>{n}</span>)}</div><div className="month-cells">{cells.map(d=>{const key=dateKey(d),items=data.blocks.filter(b=>b.date===key),inside=d.getMonth()===date.getMonth(),today=key===dateKey(new Date());return <div key={key} className={`month-cell ${inside?'':'outside'} ${today?'today':''}`}><button className="month-date" onClick={()=>onSelect(d)}>{d.getDate()}</button><div className="month-dots">{items.slice(0,4).map(b=>{const c=data.categories.find(x=>x.id===b.categoryId);return <i key={b.id} style={{background:c?.color||'#9ca3af'}} title={c?.name||'Compromisso'}/>})}</div><button className="month-add" aria-label={`Adicionar compromisso em ${key}`} onClick={()=>onAdd(d)}><Plus size={13}/></button></div>})}</div></div>}
function BlockModal({categories,block,date,onClose,onSave,onDelete,onAddCategory}:{categories:Category[],block:TimeBlock|null,date:string,onClose:()=>void,onSave:(v:Omit<TimeBlock,'id'|'createdAt'|'updatedAt'>)=>void,onDelete:(id:string)=>void,onAddCategory:()=>void}){
  const [day,setDay]=useState(block?.date||date),[start,setStart]=useState(block?.start||'09:00'),[end,setEnd]=useState(block?.end||'10:00'),[categoryId,setCategoryId]=useState(block?.categoryId||categories[0]?.id||''),[status,setStatus]=useState<BlockStatus>(block?.status||'planned'),[note,setNote]=useState(block?.note||'')
  return <Modal title={block?'Editar compromisso':'Novo compromisso'} onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave({date:day,start,end,categoryId,status,note:note.trim()||undefined})}}>
    <label>Data<input type="date" value={day} onChange={e=>setDay(e.target.value)} required/></label>
    <div className="form-row"><label>Início<input type="time" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Fim<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label></div>
    <label>Categoria{categories.length?<select value={categoryId} onChange={e=>setCategoryId(e.target.value)} required>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select>:<button type="button" className="inline-create" onClick={onAddCategory}>+ Criar primeira categoria</button>}</label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value as BlockStatus)}><option value="planned">Planejado</option><option value="completed">Realizado</option><option value="missed">Não realizado</option><option value="rescheduled">Reorganizado</option></select></label>
    <label>Observação <span className="optional">(opcional)</span><textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Adicione um detalhe, se necessário"/></label>
    <div className="modal-actions">{block&&<button type="button" className="danger-button" onClick={()=>onDelete(block.id)}><Trash2 size={15}/> Excluir</button>}<button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!categories.length}>Salvar compromisso</button></div>
  </form></Modal>
}
function CategoryModal({onClose,onSave}:{onClose:()=>void,onSave:(n:string,c:string,p:Priority,g:number,pr:boolean)=>void}){const [name,setName]=useState(''),[color,setColor]=useState('#6477d8'),[priority,setPriority]=useState<Priority>('medium'),[goal,setGoal]=useState(''),[protectedItem,setProtected]=useState(false);return <Modal title="Nova categoria" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(name,color,priority,Math.max(0,Number(goal)||0)*60,protectedItem)}}><label>Nome<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Estudos" required maxLength={32}/></label><div className="form-row"><label>Cor<input type="color" className="color-input" value={color} onChange={e=>setColor(e.target.value)}/></label><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value as Priority)}>{Object.entries(priorityLabel).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></div><label>Meta semanal em horas <span className="optional">(opcional)</span><input type="number" min="0" max="168" step="0.5" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Ex.: 10"/></label><label className="check-label"><input type="checkbox" checked={protectedItem} onChange={e=>setProtected(e.target.checked)}/> Proteger esta categoria contra reduções automáticas</label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Criar categoria</button></div></form></Modal>}
function CategoryManager({categories,onClose,onArchive,onRestore}:{categories:Category[],onClose:()=>void,onArchive:(id:string)=>void,onRestore:(id:string)=>void}){return <Modal title="Gerenciar categorias" onClose={onClose}><div className="manage-list">{categories.map(c=><div className="manage-item" key={c.id}><i style={{background:c.color}}/><div><strong>{c.name}</strong><small>{priorityLabel[c.priority]} · {c.protected?'Protegida':'Flexibilidade padrão'}</small></div>{c.active?<button className="secondary-button small" onClick={()=>onArchive(c.id)}>Arquivar</button>:<button className="secondary-button small" onClick={()=>onRestore(c.id)}>Restaurar</button>}</div>)}{!categories.length&&<p className="empty-copy">Nenhuma categoria criada ainda.</p>}</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Fechar</button></div></Modal>}
function Modal({title,children,onClose}:{title:string,children:React.ReactNode,onClose:()=>void}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>{children}</section></div>}
