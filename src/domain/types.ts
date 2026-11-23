export type Priority = 'critical' | 'high' | 'medium' | 'flexible'
export type BlockStatus = 'planned' | 'completed' | 'missed' | 'rescheduled'

export interface Category {
  id: string
  name: string
  color: string
  priority: Priority
  weeklyGoalMinutes: number
  protected: boolean
  active: boolean
}

export interface TimeBlock {
  id: string
  date: string // YYYY-MM-DD, local calendar date
  start: string // HH:mm
  end: string // HH:mm
  categoryId: string
  status: BlockStatus
  note?: string
  createdAt: string
  updatedAt: string
}

export interface PlannerData {
  version: 1
  categories: Category[]
  blocks: TimeBlock[]
}