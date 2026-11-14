export const columns = [
  { id: 'todo', name: 'To Do' },
  { id: 'in_progress', name: 'In Progress' },
  { id: 'in_review', name: 'In Review' },
  { id: 'done', name: 'Done' },
] as const

export const priorities = [
  { id: 'low', name: 'Low' },
  { id: 'normal', name: 'Normal' },
  { id: 'high', name: 'High' },
] as const

export const colors = ['violet', 'blue', 'green', 'amber', 'rose', 'slate'] as const
export type Status = typeof columns[number]['id']
export type Priority = typeof priorities[number]['id']
export type Color = typeof colors[number]
export type NamedItem = { id: string; name: string; color: Color }
export type TaskDraft = {
  title: string
  description: string
  status: Status
  priority: Priority
  due_date: string | null
  memberIds: string[]
  labelIds: string[]
}
export type Task = TaskDraft & { id: string; updated_at: string; created_at: string; commentCount: number }
export type Comment = { id: string; body: string; created_at: string }
export type Activity = {
  id: number
  action: string
  details: { from?: Status; to?: Status; fields?: string[]; name?: string | null }
  created_at: string
}

export function newDraft(status: Status): TaskDraft {
  return { title: '', description: '', status, priority: 'normal', due_date: null, memberIds: [], labelIds: [] }
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
}

export function statusName(status?: Status) {
  return columns.find(column => column.id === status)?.name ?? 'Unknown'
}

export function dueInfo(date: string, done: boolean, now = new Date()) {
  // Compare calendar dates so daylight-saving transitions never change the number of days.
  const [year, month, day] = date.split('-').map(Number)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const difference = (Date.UTC(year, month - 1, day) - today) / 86_400_000
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(new Date(year, month - 1, day))
  if (done) return { text: formatted, tone: 'neutral', overdue: false }
  if (difference < 0) return { text: formatted, tone: 'overdue', overdue: true }
  if (difference === 0) return { text: 'Today', tone: 'soon', overdue: false }
  if (difference === 1) return { text: 'Tomorrow', tone: 'soon', overdue: false }
  return { text: formatted, tone: difference <= 3 ? 'soon' : 'neutral', overdue: false }
}

export function activityText({ action, details }: Activity) {
  switch (action) {
    case 'created': return 'Created this task'
    case 'moved': return `Moved from ${statusName(details.from)} to ${statusName(details.to)}`
    case 'edited': return `Updated ${details.fields?.join(', ') ?? 'task details'}`
    case 'assigned': return `Assigned ${details.name ?? 'a team member'}`
    case 'unassigned': return `Unassigned ${details.name ?? 'a team member'}`
    case 'label_added': return `Added the ${details.name ?? 'task'} label`
    case 'label_removed': return `Removed the ${details.name ?? 'task'} label`
    default: return 'Updated this task'
  }
}
