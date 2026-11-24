export type Priority = 'critical' | 'high' | 'medium' | 'flexible'
export type BlockStatus = 'planned' | 'completed' | 'missed' | 'rescheduled'
export type Shift = 'morning' | 'afternoon' | 'night'

export interface Category {
  id: string
  name: string
  color: string
  priority: Priority
  weeklyGoalsByShift: Record<Shift, number>
  protected: boolean
  active: boolean
}

export interface TimeBlock {
  id: string
  date: string
  shift: Shift
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
