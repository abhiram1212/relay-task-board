import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, CalendarDays, LoaderCircle, X } from 'lucide-react'
import { dueInfo, initials, priorities, type NamedItem, type Priority } from './model'

export function Logo() {
  return <img className="logo" src="/relay.svg" alt="" width="25" height="25" />
}

export function Avatar({ item }: { item: NamedItem }) {
  return <span className={`avatar tone-${item.color}`} title={item.name} aria-label={item.name}>{initials(item.name)}</span>
}

export function Label({ item }: { item: NamedItem }) {
  return <span className={`label tone-${item.color}`}>{item.name}</span>
}

export function PriorityMark({ priority }: { priority: Priority }) {
  const Icon = { low: ArrowDown, normal: ArrowRight, high: ArrowUp }[priority]
  return <span className={`priority priority-${priority}`} title="Task priority">
    <Icon size={13} />{priorities.find(option => option.id === priority)?.name}
  </span>
}

export function DueBadge({ date, done }: { date: string; done: boolean }) {
  const { text, tone } = dueInfo(date, done)
  return <time className={`due due-${tone}`} dateTime={date} title={tone === 'overdue' ? 'Overdue' : `Due ${date}`}>
    <CalendarDays size={13} />{text}{tone === 'overdue' && <span className="sr-only"> · Overdue</span>}
  </time>
}

export function ErrorBox({ message, action }: { message: string; action?: ReactNode }) {
  return <div className="error-box" role="alert"><AlertCircle size={17} /><span>{message}</span>{action}</div>
}

export function Spinner({ children }: { children: ReactNode }) {
  return <div className="spinner" role="status"><LoaderCircle size={17} />{children}</div>
}

export function Modal({ title, eyebrow, side, busy, onClose, children }: {
  title: string
  eyebrow?: string
  side?: boolean
  busy?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [])

  return <dialog ref={ref} className={side ? 'modal drawer' : 'modal'} aria-label={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => {
      if (!busy && event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }
    }}>
    <section className="modal-inner">
      <header className="modal-header">
        <div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={19} /></button>
      </header>
      {children}
    </section>
  </dialog>
}

const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export function Timestamp({ date }: { date: string }) {
  return <time dateTime={date}>{timestamp.format(new Date(date))}</time>
}
