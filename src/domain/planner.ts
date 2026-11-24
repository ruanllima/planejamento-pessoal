import type { PlannerData, TimeBlock } from './types'
import { minutesBetween } from './date'

export function validateBlock(candidate: Pick<TimeBlock, 'date'|'start'|'end'|'categoryId'>, blocks: TimeBlock[], ignoreId?: string): string | null {
  if (!candidate.date || !candidate.start || !candidate.end || !candidate.categoryId) return 'Preencha todos os campos obrigatórios.'
  if (candidate.start === candidate.end) return 'O horário inicial e final não podem ser iguais.'
  const start = toMinutes(candidate.start), end = toMinutes(candidate.end)
  if (end <= start) return 'Por enquanto, os blocos precisam terminar no mesmo dia em que começam.'
  const conflict = blocks.some(b => b.id !== ignoreId && b.date === candidate.date &&
    start < toMinutes(b.end) && end > toMinutes(b.start))
  return conflict ? 'Esse horário conflita com outro compromisso.' : null
}
function toMinutes(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m }
export function blockDuration(block: TimeBlock) { return minutesBetween(block.start, block.end) }
export function summarize(data: PlannerData, from: string, to: string) {
  const blocks = data.blocks.filter(b => b.date >= from && b.date <= to)
  const planned = blocks.reduce((s,b) => s + blockDuration(b), 0)
  const completed = blocks.filter(b => b.status === 'completed').reduce((s,b) => s + blockDuration(b), 0)
  const missed = blocks.filter(b => b.status === 'missed').reduce((s,b) => s + blockDuration(b), 0)
  return { planned, completed, missed, pending: Math.max(0, planned - completed) }
}
export function categoryTotals(data: PlannerData, from: string, to: string) {
  return data.categories.filter(c => c.active).map(category => {
    const blocks = data.blocks.filter(b => b.categoryId === category.id && b.date >= from && b.date <= to)
    const completed = blocks.filter(b => b.status === 'completed').reduce((s,b) => s + blockDuration(b), 0)
    const planned = blocks.filter(b => b.status !== 'missed').reduce((s,b) => s + blockDuration(b), 0)
    return { category, planned, completed, goal: category.weeklyGoalMinutes }
  })
}