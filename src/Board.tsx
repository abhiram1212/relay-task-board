import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { Circle, CircleCheck, CircleDashed, CircleDot, GripVertical, MessageSquare, Plus } from 'lucide-react'
import { Avatar, DueBadge, Label, PriorityMark } from './components'
import { columns, statusName, type NamedItem, type Status, type Task } from './model'

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return
  event.preventDefault()
  const current = context.over?.id ?? context.active?.data.current?.status
  const index = columns.findIndex(column => column.id === current)
  const destination = columns[index + (event.code === 'ArrowLeft' ? -1 : 1)]
  const lane = destination && context.droppableRects.get(destination.id)
  const card = context.collisionRect
  if (!lane || !card || index < 0) return
  return {
    x: currentCoordinates.x + lane.left + (lane.width - card.width) / 2 - card.left,
    y: currentCoordinates.y + lane.top + (lane.height - card.height) / 2 - card.top,
  }
}

const statusIcons = { todo: CircleDashed, in_progress: CircleDot, in_review: Circle, done: CircleCheck }

export function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  const Icon = statusIcons[status]
  return <Icon className={`status-icon status-${status}`} size={size} strokeWidth={2.2} aria-hidden />
}

function TaskCard({ task, members, labels, onOpen, disabled, preview }: {
  task: Task
  members: NamedItem[]
  labels: NamedItem[]
  onOpen: () => void
  disabled?: boolean
  preview?: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: task.id, data: { status: task.status }, disabled: disabled || preview,
  })
  const assigned = members.filter(member => task.memberIds.includes(member.id))
  const tags = labels.filter(label => task.labelIds.includes(label.id))
  return <article ref={preview ? undefined : setNodeRef} className={`task-card${isDragging && !preview ? ' dragging' : ''}${preview ? ' drag-preview' : ''}`} aria-hidden={preview || undefined}>
    <button className="task-open" tabIndex={preview ? -1 : undefined} onClick={onOpen} type="button">
      <strong>{task.title}</strong>
      {task.description && <span>{task.description}</span>}
    </button>
    {!preview && <button type="button" className="drag-handle" title="Drag task or use Space and the arrow keys" ref={setActivatorNodeRef}
      {...attributes} {...listeners} aria-label={`Drag ${task.title}`} disabled={disabled}>
      <GripVertical size={16} />
    </button>}
    {(tags.length > 0 || assigned.length > 0) && <div className="card-properties">
      {tags.length > 0 && <div className="card-labels">{tags.map(label => <Label key={label.id} item={label} />)}</div>}
      {assigned.length > 0 && <div className="avatar-stack">
        {assigned.slice(0, 3).map(member => <Avatar key={member.id} item={member} />)}
        {assigned.length > 3 && <span className="avatar overflow-avatar" title={assigned.slice(3).map(member => member.name).join(', ')}>+{assigned.length - 3}</span>}
      </div>}
    </div>}
    <div className="card-meta">
      <PriorityMark priority={task.priority} />
      {task.due_date && <DueBadge date={task.due_date} done={task.status === 'done'} />}
      {task.commentCount > 0 && <span className="comment-count" aria-label={`${task.commentCount} comments`}><MessageSquare size={13} />{task.commentCount}</span>}
    </div>
  </article>
}

type BoardProps = {
  tasks: Task[]
  members: NamedItem[]
  labels: NamedItem[]
  onOpen: (task: Task) => void
  onNew: (status: Status) => void
  onMove: (task: Task, status: Status) => void
  moving: boolean
  filtered: boolean
}

function Lane({ column, tasks, members, labels, onOpen, onNew, moving, filtered }: Omit<BoardProps, 'onMove'> & {
  column: typeof columns[number]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id })
  return <section ref={setNodeRef} className={`lane lane-${column.id}${isOver ? ' lane-over' : ''}`}
    aria-label={column.name} data-status={column.id}>
    <header className="lane-header">
      <h2 className="lane-status"><StatusIcon status={column.id} size={13} />{column.name}</h2>
      <span className="lane-count">{tasks.length}</span>
    </header>
    <div className="lane-cards">
      {tasks.map(task => <TaskCard key={task.id} task={task} members={members} labels={labels} disabled={moving} onOpen={() => onOpen(task)} />)}
      {tasks.length === 0 && filtered && <p className="lane-empty">No matching tasks</p>}
    </div>
    <button className="lane-add" type="button" aria-label={`Add task to ${column.name}`} disabled={moving} onClick={() => onNew(column.id)}><Plus size={15} /> Add task</button>
  </section>
}

export default function Board(props: BoardProps) {
  const [active, setActive] = useState<Task>()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  )
  const laneName = (id: string | number) => statusName(columns.find(column => column.id === id)?.id)
  function onEnd({ active: dragged, over }: DragEndEvent) {
    setActive(undefined)
    const task = props.tasks.find(item => item.id === dragged.id)
    const status = columns.find(column => column.id === over?.id)?.id
    if (task && status && task.status !== status) props.onMove(task, status)
  }
  return <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
    accessibility={{
      screenReaderInstructions: { draggable: 'Press Space to pick up a task. Use Left and Right to choose a column, Space to drop, or Escape to cancel.' },
      announcements: {
        onDragStart: ({ active }) => `Picked up ${props.tasks.find(task => task.id === active.id)?.title ?? 'task'}.`,
        onDragOver: ({ over }) => over ? `Over ${laneName(over.id)}.` : 'Outside the board.',
        onDragEnd: ({ over }) => over ? `Dropped in ${laneName(over.id)}.` : 'Returned to the original column.',
        onDragCancel: () => 'Move cancelled.',
      },
    }}
    onDragStart={({ active: dragged }) => setActive(props.tasks.find(task => task.id === dragged.id))}
    onDragCancel={() => setActive(undefined)} onDragEnd={onEnd}>
    <div className="board-scroll">
      <div className="board">
        {columns.map(column => <Lane key={column.id} {...props} column={column}
          tasks={props.tasks.filter(task => task.status === column.id)} />)}
      </div>
    </div>
    <DragOverlay dropAnimation={null}>{active && <TaskCard preview task={active} members={props.members} labels={props.labels} onOpen={() => {}} />}</DragOverlay>
  </DndContext>
}
