export const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
export function parseDate(key: string): Date {
  const [y,m,d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
export function addDays(date: Date, amount: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + amount)
  return d
}
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date)
  return Array.from({length: 7}, (_, i) => addDays(start, i))
}
export function formatRange(days: Date[]): string {
  const a = days[0], b = days[6]
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const monthA = a.toLocaleDateString('pt-BR', {month:'long'})
  const monthB = b.toLocaleDateString('pt-BR', {month:'long'})
  if (sameMonth) return `${a.getDate()}–${b.getDate()} de ${monthA} de ${b.getFullYear()}`
  return `${a.getDate()} ${monthA} – ${b.getDate()} ${monthB} de ${b.getFullYear()}`
}
export function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({length: 42}, (_, i) => addDays(start, i))
}
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff <= 0) diff += 24 * 60
  return diff
}
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m ? `${h}h ${m}min` : `${h}h`
}
export function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', {month:'long', year:'numeric'})
}