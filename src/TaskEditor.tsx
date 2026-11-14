import { useEffect, useState, type FormEvent } from 'react'
import { Activity as ActivityIcon, Check, MessageSquare, Send, Trash2 } from 'lucide-react'
import { deleteTask, errorText, getTaskDetail, postComment, saveTask } from './api'
import { Avatar, ErrorBox, Label, Modal, Spinner, Timestamp } from './components'
import { activityText, columns, newDraft, priorities, type NamedItem, type Status, type Task, type TaskDraft } from './model'

type Detail = Awaited<ReturnType<typeof getTaskDetail>>
type Tab = 'details' | 'comments' | 'activity'

function Choices({ items, selected, onChange, member }: {
  items: NamedItem[]
  selected: string[]
  onChange: (ids: string[]) => void
  member?: boolean
}) {
  if (!items.length) return <p className="field-note">{member ? 'Add team members from the Team section.' : 'Create labels from the Labels section.'}</p>
  return <div className="choice-list">
    {items.map(item => {
      const checked = selected.includes(item.id)
      return <button key={item.id} type="button" className={`choice${checked ? ' selected' : ''}`} aria-pressed={checked}
        onClick={() => onChange(checked ? selected.filter(id => id !== item.id) : [...selected, item.id])}>
        {member ? <><Avatar item={item} />{item.name}</> : <Label item={item} />}
        {checked && <Check size={13} />}
      </button>
    })}
  </div>
}

export default function TaskEditor({ task, status, members, labels, onClose, onChange }: {
  task?: Task
  status: Status
  members: NamedItem[]
  labels: NamedItem[]
  onClose: () => void
  onChange: (message: string, close?: boolean) => Promise<void>
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => task ?? newDraft(status))
  const [tab, setTab] = useState<Tab>('details')
  const [detail, setDetail] = useState<Detail>()
  const [detailError, setDetailError] = useState('')
  const [reloadDetail, setReloadDetail] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!task) return
    let current = true
    getTaskDetail(task.id).then(result => { if (current) setDetail(result) })
      .catch(cause => { if (current) setDetailError(errorText(cause)) })
    return () => { current = false }
  }, [task, reloadDetail])

  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !draft.title.trim()) return
    setBusy(true)
    setError('')
    try {
      await saveTask(draft, task)
      await onChange(task ? 'Task updated' : 'Task created', true)
    } catch (cause) {
      setError(errorText(cause))
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!task || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteTask(task)
      await onChange('Task deleted', true)
    } catch (cause) {
      setError(errorText(cause))
    } finally { setBusy(false) }
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault()
    if (!task || !detail || busy || !comment.trim()) return
    setBusy(true)
    setError('')
    try {
      const added = await postComment(task.id, comment)
      setDetail(previous => previous ? { ...previous, comments: [...previous.comments, added] } : previous)
      setComment('')
      await onChange('Comment posted')
    } catch (cause) {
      setError(errorText(cause))
    } finally { setBusy(false) }
  }

  return <Modal title={task ? task.title : 'New task'} eyebrow={task ? 'Task details' : undefined} side={Boolean(task)} busy={busy} onClose={onClose}>
    {task && <div className="detail-tabs" aria-label="Task sections">
      {([{ id: 'details', name: 'Details' }, { id: 'comments', name: 'Comments' }, { id: 'activity', name: 'Activity' }] as const).map(option =>
        <button type="button" key={option.id} disabled={busy} aria-pressed={tab === option.id}
          onClick={() => { setError(''); setConfirmDelete(false); setTab(option.id) }}>{option.name}
          {option.id === 'comments' && detail && <span>{detail.comments.length}</span>}
        </button>)}
    </div>}
    <div className="modal-content">
      {error && <ErrorBox message={error} />}
      {tab === 'details' && <form className="task-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label className="field">Title<input autoFocus={!task} value={draft.title} maxLength={120} required placeholder="What needs to be done?" onChange={event => update('title', event.target.value)} /></label>
          <label className="field">Description<textarea value={draft.description} maxLength={4000} rows={3} placeholder="Add more context…" onChange={event => update('description', event.target.value)} /></label>
          <div className="field-grid">
            <label className="field">Status<select value={draft.status} onChange={event => update('status', event.target.value as Status)}>
              {columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select></label>
            <label className="field">Priority<select value={draft.priority} onChange={event => update('priority', event.target.value as TaskDraft['priority'])}>
              {priorities.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select></label>
          </div>
          <label className="field">Due date<input type="date" min="1900-01-01" max="9999-12-31" value={draft.due_date ?? ''} onChange={event => update('due_date', event.target.value || null)} /></label>
          <div className="field">Assignees<Choices member items={members} selected={draft.memberIds} onChange={ids => update('memberIds', ids)} /></div>
          <div className="field">Labels<Choices items={labels} selected={draft.labelIds} onChange={ids => update('labelIds', ids)} /></div>
        </fieldset>
        {confirmDelete && <div className="delete-confirm">
          <p>Delete this task and its comments and activity?</p>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep task</button>
          <button className="button danger" type="button" disabled={busy} onClick={() => void remove()}>Delete permanently</button>
        </div>}
        <footer className="modal-actions">
          {task && <button type="button" className="icon-button delete-task" title="Delete task" aria-label="Delete task" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>}
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || !draft.title.trim()}>{busy ? 'Working…' : task ? 'Save changes' : 'Create task'}</button>
        </footer>
      </form>}
      {tab !== 'details' && detailError && <ErrorBox message={detailError} action={<button className="button secondary compact" onClick={() => { setDetailError(''); setReloadDetail(count => count + 1) }}>Retry</button>} />}
      {tab !== 'details' && !detail && !detailError && <Spinner>Loading task {tab}…</Spinner>}
      {tab === 'comments' && <>
        {detail && (detail.comments.length ? <ol className="comments-list">{detail.comments.map(item =>
          <li key={item.id}><span className="avatar guest-avatar">G</span><div><strong>Guest</strong><Timestamp date={item.created_at} /><p>{item.body}</p></div></li>)}</ol>
          : <div className="detail-empty"><MessageSquare size={23} /><strong>No comments yet</strong></div>)}
        <form className="comment-form" onSubmit={sendComment}>
          <label className="field">Comment<textarea value={comment} rows={3} maxLength={2000} placeholder="Write a comment…" onChange={event => setComment(event.target.value)} disabled={busy} /></label>
          <button className="button primary" type="submit" disabled={!detail || busy || !comment.trim()}><Send size={14} />{busy ? 'Posting…' : 'Post comment'}</button>
        </form>
      </>}
      {tab === 'activity' && detail && <ol className="activity-list">
        {detail.activity.map(item => <li key={item.id}><span className="activity-icon"><ActivityIcon size={15} /></span>
          <div><strong>{activityText(item)}</strong><Timestamp date={item.created_at} /></div></li>)}
      </ol>}
    </div>
  </Modal>
}
