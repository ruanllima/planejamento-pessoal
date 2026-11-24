import type { PlannerData, TimeBlock } from './types'

export function validateBlock(candidate: Pick<TimeBlock, 'date'|'shift'|'categoryId'>): string | null {
  if (!candidate.date || !candidate.shift || !candidate.categoryId) return 'Preencha todos os campos obrigatórios.'
  return null
}

export function blockDuration(_block: TimeBlock) { return 1 }

export function summarize(data: PlannerData, from: string, to: string) {
  const blocks = data.blocks.filter(b => b.date >= from && b.date <= to)
  const planned = blocks.length
  const completed = blocks.filter(b => b.status === 'completed').length
  const missed = blocks.filter(b => b.status === 'missed').length
  return { planned, completed, missed, pending: blocks.filter(b => b.status === 'planned' || b.status === 'rescheduled').length }
}
