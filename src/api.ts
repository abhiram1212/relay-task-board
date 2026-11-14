import { createClient } from '@supabase/supabase-js'
import type { Activity, Color, Comment, NamedItem, Status, Task, TaskDraft } from './model'

const url = import.meta.env.VITE_SUPABASE_URL
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const configured = Boolean(url && publicKey && publicKey !== 'replace-with-public-key')
const client = configured ? createClient(url, publicKey) : null

function backend() {
  if (!client) throw new Error('Set the Supabase URL and publishable key in .env.local, then restart Relay.')
  return client
}

let sessionPromise: Promise<void> | undefined
export function ensureGuest() {
  sessionPromise ??= (async () => {
    const auth = backend().auth
    const { data, error } = await auth.getSession()
    if (error) throw error
    if (data.session) return
    const { error: signInError } = await auth.signInAnonymously()
    if (signInError) throw signInError
  })().finally(() => { sessionPromise = undefined })
  return sessionPromise
}

type Response<T> = { data: T | null; error: unknown }
function read<T>(response: Response<T>): T {
  if (response.error) throw response.error
  return response.data as T
}

async function all<T>(query: (start: number, end: number) => PromiseLike<Response<T[]>>) {
  const rows: T[] = []
  const pageSize = 250
  for (let start = 0; ; start += pageSize) {
    const page = read(await query(start, start + pageSize - 1))
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

type TaskRow = Omit<Task, 'memberIds' | 'labelIds' | 'commentCount'> & {
  task_assignees: { member_id: string }[]
  task_labels: { label_id: string }[]
  comments: { count: number }[]
}
export type Collection = 'team_members' | 'labels'
export type BoardData = { tasks: Task[]; members: NamedItem[]; labels: NamedItem[] }

export async function getBoard(): Promise<BoardData> {
  const db = backend()
  const list = (table: Collection) => all<NamedItem>((from, to) => db
    .from(table).select('id,name,color').order('name').order('id').range(from, to))
  const [rows, members, labels] = await Promise.all([
    all<TaskRow>((from, to) => db.from('tasks')
      .select('id,title,description,status,priority,due_date,created_at,updated_at,task_assignees(member_id),task_labels(label_id),comments(count)')
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    list('team_members'),
    list('labels'),
  ])
  return {
    tasks: rows.map(({ task_assignees, task_labels, comments, ...task }) => ({
      ...task,
      memberIds: task_assignees.map(row => row.member_id),
      labelIds: task_labels.map(row => row.label_id),
      commentCount: comments[0]?.count ?? 0,
    })),
    members,
    labels,
  }
}

export async function saveTask(draft: TaskDraft, current?: Task) {
  return read(await backend().rpc('save_task', {
    task_id: current?.id ?? null,
    expected_updated_at: current?.updated_at ?? null,
    task_title: draft.title,
    task_description: draft.description,
    task_status: draft.status,
    task_priority: draft.priority,
    task_due_date: draft.due_date,
    member_ids: draft.memberIds,
    label_ids: draft.labelIds,
  }))
}

export async function moveTask(task: Task, status: Status) {
  const result = read(await backend().from('tasks').update({ status })
    .eq('id', task.id).eq('updated_at', task.updated_at).select('updated_at').maybeSingle().overrideTypes<{ updated_at: string } | null>())
  if (!result) throw new Error('This task changed in another tab. Refresh the board and try again.')
  return result.updated_at as string
}

export async function deleteTask(task: Task) {
  const result = read(await backend().from('tasks').delete().eq('id', task.id)
    .eq('updated_at', task.updated_at).select('id').maybeSingle())
  if (!result) throw new Error('This task changed since it was opened. Refresh the board and try again.')
}

export async function getTaskDetail(taskId: string) {
  const db = backend()
  const [comments, activity] = await Promise.all([
    all<Comment>((from, to) => db.from('comments').select('id,body,created_at')
      .eq('task_id', taskId).order('created_at').order('id').range(from, to)),
    all<Activity>((from, to) => db.from('task_activity').select('id,action,details,created_at')
      .eq('task_id', taskId).order('id', { ascending: false }).range(from, to)),
  ])
  return { comments, activity }
}

export async function postComment(taskId: string, body: string): Promise<Comment> {
  return read(await backend().from('comments').insert({ task_id: taskId, body: body.trim() })
    .select('id,body,created_at').single())
}

export async function createNamedItem(table: Collection, name: string, color: Color) {
  read(await backend().from(table).insert({ name: name.trim(), color }))
}

export async function deleteNamedItem(table: Collection, id: string) {
  read(await backend().from(table).delete().eq('id', id))
}

export async function loadExample() {
  const today = new Date()
  const board_date = [
    today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0'),
  ].join('-')
  read(await backend().rpc('load_example_board', { board_date }))
}

export function errorText(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && error.code === '23505') return 'That name is already in use.'
    if ('message' in error && typeof error.message === 'string') return error.message
  }
  return 'Something went wrong. Please try again.'
}
