import type { PlannerData } from '../domain/types'

const KEY = 'ritmo.planner.v1'
const emptyData: PlannerData = { version: 1, categories: [], blocks: [] }

export function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyData
    const parsed = JSON.parse(raw) as PlannerData
    if (parsed.version !== 1 || !Array.isArray(parsed.categories) || !Array.isArray(parsed.blocks)) return emptyData
    return parsed
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