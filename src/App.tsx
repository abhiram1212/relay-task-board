import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, CalendarClock, Check, ChevronRight, CircleCheck, CircleHelp,
  FlaskConical, Kanban, LayoutGrid, Plus, RefreshCw, Search, SlidersHorizontal, Tag, Users, X,
} from 'lucide-react'
import { configured, ensureGuest, errorText, getBoard, loadExample, moveTask, type BoardData, type Collection } from './api'
import Board from './Board'
import CollectionEditor from './CollectionEditor'
import { Avatar, ErrorBox, Logo, Modal, Spinner } from './components'
import { dueInfo, priorities, statusName, type Priority, type Status, type Task } from './model'
import TaskEditor from './TaskEditor'

type Editor = { status: Status; task?: Task }
const empty: BoardData = { tasks: [], members: [], labels: [] }

export default function App() {
  const [{ tasks, members, labels }, setData] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editor, setEditor] = useState<Editor>()
  const [collection, setCollection] = useState<Collection>()
  const [about, setAbout] = useState(false)
  const [working, setWorking] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mutation = useRef(false)

  async function refresh() {
    setError('')
    try {
      await ensureGuest()
      const data = await getBoard()
      setData(data)
      setAssignee(current => current === 'unassigned' || data.members.some(item => item.id === current) ? current : '')
      setLabel(current => data.labels.some(item => item.id === current) ? current : '')
      setReady(true)
    } catch (cause) {
      setError(errorText(cause))
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    function dismissFilters(event: PointerEvent) {
      if (event.target instanceof Node && !filtersRef.current?.contains(event.target)) setFiltersOpen(false)
    }
    window.addEventListener('keydown', shortcut)
    window.addEventListener('pointerdown', dismissFilters)
    return () => {
      window.removeEventListener('keydown', shortcut)
      window.removeEventListener('pointerdown', dismissFilters)
      clearTimeout(toastTimer.current)
    }
  }, [])

  function notify(message: string) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  async function changed(message: string, close?: boolean) {
    await refresh()
    if (close) setEditor(undefined)
    notify(message)
  }

  async function move(task: Task, status: Status) {
    if (mutation.current) return
    mutation.current = true
    setWorking(true)
    setError('')
    setData(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, status } : item) }))
    try {
      const updated_at = await moveTask(task, status)
      setData(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, updated_at } : item) }))
      notify(`Moved to ${statusName(status)}`)
    } catch (cause) {
      setData(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? task : item) }))
      setError(errorText(cause))
    } finally { mutation.current = false; setWorking(false) }
  }

  async function example() {
    if (mutation.current) return
    mutation.current = true
    setWorking(true)
    setError('')
    try {
      await loadExample()
      await changed('Example tasks added')
    } catch (cause) {
      setError(errorText(cause))
    } finally { mutation.current = false; setWorking(false) }
  }

  async function manualRefresh() {
    if (mutation.current) return
    mutation.current = true
    setWorking(true)
    try { await refresh() }
    finally { mutation.current = false; setWorking(false) }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filterCount = Number(Boolean(priority)) + Number(Boolean(assignee)) + Number(Boolean(label))
  const filtered = Boolean(normalizedQuery || filterCount)
  const shown = tasks.filter(task =>
    (!normalizedQuery || task.title.toLocaleLowerCase().includes(normalizedQuery)) &&
    (!priority || task.priority === priority) &&
    (!assignee || (assignee === 'unassigned' ? task.memberIds.length === 0 : task.memberIds.includes(assignee))) &&
    (!label || task.labelIds.includes(label)),
  )
  const completed = tasks.filter(task => task.status === 'done').length
  const overdue = tasks.filter(task => task.due_date && dueInfo(task.due_date, task.status === 'done').overdue).length
  const completion = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  function clearFilters() { setQuery(''); setPriority(''); setAssignee(''); setLabel('') }

  return <div className="app">
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand"><Logo /><span>Relay</span></div>
      <div className="sidebar-body">
        <p className="nav-heading">Workspace</p>
        <button className="nav-item current" type="button" aria-current="page" onClick={() => { clearFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Kanban size={17} /> Project board</button>
        <p className="nav-heading manage-heading">Manage</p>
        <button className="nav-item" type="button" disabled={!ready || working} onClick={() => setCollection('team_members')}><Users size={17} /> Team</button>
        <button className="nav-item" type="button" disabled={!ready || working} onClick={() => setCollection('labels')}><Tag size={17} /> Labels</button>
      </div>
      <div className="sidebar-end">
        <button className="nav-item" type="button" aria-label="About Relay" onClick={() => setAbout(true)}><CircleHelp size={17} /> About Relay</button>
        <div className="session">
          <span className="avatar guest-avatar">G</span><div><strong>Guest workspace</strong><span>Private board</span></div>
        </div>
      </div>
    </aside>

    <main className="main">
      <div className="topbar">
        <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>Project board</strong></div>
        <div className="topbar-actions">
          <span className={`connection${ready && !error ? ' online' : ''}`}><i />{loading ? 'Connecting' : ready && !error ? 'Guest session' : 'Connection needs attention'}</span>
          <button className="icon-button refresh-button" type="button" aria-label="Refresh board" title="Refresh board" disabled={loading || working} onClick={() => void manualRefresh()}><RefreshCw size={16} /></button>
        </div>
      </div>
      <div className="workspace">
        <header className="page-header">
          <div><h1>Project board</h1></div>
          <button type="button" className="button primary new-task" disabled={!ready || working} onClick={() => setEditor({ status: 'todo' })}><Plus size={18} /> New task</button>
        </header>

        <section className="stats" aria-label="Board summary">
          <div className="stat"><span className="stat-icon tone-violet"><LayoutGrid size={19} /></span><div><span>Total tasks</span><strong>{ready ? tasks.length : '—'}</strong></div></div>
          <div className="stat"><span className="stat-icon tone-green"><CircleCheck size={20} /></span><div><span>Completed</span><strong>{ready ? completed : '—'}</strong></div>
            {ready && tasks.length > 0 && <span className="completion" title={`${completion}% completed`}>{completion}% <ArrowUpRight size={12} /></span>}
          </div>
          <div className="stat"><span className="stat-icon tone-rose"><CalendarClock size={19} /></span><div><span>Overdue</span><strong>{ready ? overdue : '—'}</strong></div></div>
        </section>

        <section className="board-area" aria-labelledby="board-title">
          <div className="toolbar">
            <div className="board-title"><Kanban size={18} /><h2 id="board-title">Board</h2>
              {filtered && <span className="results">{shown.length} of {tasks.length}</span>}
            </div>
            <div className="tools">
              {members.length > 0 && <button className="team-shortcut avatar-stack" type="button" title="View team members" aria-label="View team members" disabled={working} onClick={() => setCollection('team_members')}>
                {members.slice(0, 4).map(member => <Avatar key={member.id} item={member} />)}
                {members.length > 4 && <span className="avatar overflow-avatar">+{members.length - 4}</span>}
              </button>}
              <label className="search"><Search size={16} /><input ref={searchRef} aria-label="Search tasks" placeholder="Search tasks…" value={query} disabled={!ready} onChange={event => setQuery(event.target.value)} />
                {query ? <button className="icon-button" type="button" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus() }}><X size={14} /></button>
                  : <kbd>{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>}
              </label>
              <div className="filters" ref={filtersRef} onKeyDown={event => { if (event.key === 'Escape') { setFiltersOpen(false); filtersRef.current?.querySelector('button')?.focus() } }}>
                <button className={`button secondary filter-button${filterCount ? ' filter-active' : ''}`} type="button" aria-expanded={filtersOpen} disabled={!ready} onClick={() => setFiltersOpen(open => !open)}><SlidersHorizontal size={15} /> Filter{filterCount > 0 && <span>{filterCount}</span>}</button>
                {filtersOpen && <div className="filter-panel">
                  <div className="filter-heading"><strong>Filter tasks</strong><button type="button" className="text-button" onClick={clearFilters}>Reset</button></div>
                  <label className="field">Priority<select value={priority} onChange={event => setPriority(event.target.value as Priority | '')}><option value="">Any priority</option>
                    {priorities.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
                  <label className="field">Assignee<select value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">Anyone</option><option value="unassigned">Unassigned</option>
                    {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                  <label className="field">Label<select value={label} onChange={event => setLabel(event.target.value)}><option value="">Any label</option>
                    {labels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>}
              </div>
            </div>
          </div>
          {error && <ErrorBox message={error} action={configured && <button className="button secondary compact" type="button" disabled={working} onClick={() => void manualRefresh()}>Retry</button>} />}
          {loading && <div className="loading-board"><Spinner>Opening your guest board…</Spinner></div>}
          {!loading && !ready && !configured && <div className="setup-help"><h3>Connect Supabase to open Relay</h3><p>Follow the local setup in the project README, then reload this page.</p></div>}
          {ready && <>
            {!tasks.length && !filtered && <div className="welcome">
              <span className="welcome-icon"><Kanban size={24} /></span>
              <div><h3>Start with a task</h3><p>Create your first task or load an example board to explore Relay.</p></div>
              <button type="button" className="button secondary" disabled={working} onClick={() => void example()}><FlaskConical size={16} /> {working ? 'Working…' : 'Load example board'}</button>
            </div>}
            {filtered && !shown.length && <div className="no-results"><Search size={18} /><span>No tasks match your search or filters.</span><button className="text-button" type="button" onClick={clearFilters}>Clear filters</button></div>}
            <Board tasks={shown} members={members} labels={labels} filtered={filtered} moving={working}
              onOpen={task => { if (!working) setEditor({ status: task.status, task }) }}
              onNew={status => { if (!working) setEditor({ status }) }} onMove={(task, status) => void move(task, status)} />
          </>}
        </section>
      </div>
    </main>
    <div className="toast-region" role="status">{toast && <div className="toast"><Check size={17} />{toast}</div>}</div>
    {editor && <TaskEditor task={editor.task} status={editor.status} members={members} labels={labels} onChange={changed} onClose={() => setEditor(undefined)} />}
    {collection && <CollectionEditor collection={collection} items={collection === 'team_members' ? members : labels} onChange={changed} onClose={() => setCollection(undefined)} />}
    {about && <Modal title="About Relay" onClose={() => setAbout(false)}>
      <div className="modal-content about">
        <p>Your board is tied to the guest session in this browser. Clearing browser data will remove access to that board.</p>
        <p><ArrowRight size={16} /> Drag a task by its handle to change its status.</p>
        <p><ArrowDown size={16} /> You can also open a task and change its status from the dropdown.</p>
        <p><Users size={16} /> Team members are assignees on your private board.</p>
      </div>
    </Modal>}
  </div>
}
