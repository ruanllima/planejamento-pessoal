import type { PlannerData, Shift } from '../domain/types'

const KEY = 'ritmo.planner.v1'
const emptyData: PlannerData = { version: 1, categories: [], blocks: [] }
const shifts: Shift[] = ['morning', 'afternoon', 'night']

function migrateData(raw: unknown): PlannerData {
  if (!raw || typeof raw !== 'object') return emptyData
  const parsed = raw as { version?: number; categories?: Array<Record<string, unknown>>; blocks?: Array<Record<string, unknown>> }
  if (parsed.version !== 1 || !Array.isArray(parsed.categories) || !Array.isArray(parsed.blocks)) return emptyData

  const categories = parsed.categories.map(category => {
    const legacyGoal = Number(category.weeklyGoalMinutes || 0)
    const existing = category.weeklyGoalsByShift as Partial<Record<Shift, number>> | undefined
    return {
      ...category,
      weeklyGoalsByShift: existing && shifts.some(shift => Number(existing[shift]) > 0)
        ? { morning: Number(existing.morning || 0), afternoon: Number(existing.afternoon || 0), night: Number(existing.night || 0) }
        : { morning: legacyGoal ? Math.ceil(legacyGoal / 180) : 0, afternoon: legacyGoal ? Math.ceil(legacyGoal / 180) : 0, night: legacyGoal ? Math.ceil(legacyGoal / 180) : 0 },
    }
  })

  const blocks = parsed.blocks.map(block => {
    let shift = block.shift as Shift | undefined
    if (!shift || !shifts.includes(shift)) {
      const hour = Number(String(block.start || '09:00').slice(0, 2))
      shift = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'night'
    }
    const { start: _start, end: _end, ...rest } = block
    return { ...rest, shift }
  })
  return { version: 1, categories: categories as PlannerData['categories'], blocks: blocks as PlannerData['blocks'] }
}

export function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyData
    const migrated = migrateData(JSON.parse(raw))
    return migrated
  } catch {
    return emptyData
  }
}
export function saveData(data: PlannerData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}
export function exportBackup(data: PlannerData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ritmo-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
