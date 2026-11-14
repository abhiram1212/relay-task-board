import { useState, type FormEvent } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { createNamedItem, deleteNamedItem, errorText, type Collection } from './api'
import { Avatar, ErrorBox, Label, Modal } from './components'
import { colors, type Color, type NamedItem } from './model'

export default function CollectionEditor({ collection, items, onClose, onChange }: {
  collection: Collection
  items: NamedItem[]
  onClose: () => void
  onChange: (message: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<Color>('violet')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<NamedItem>()
  const team = collection === 'team_members'
  const noun = team ? 'member' : 'label'

  async function add(event: FormEvent) {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setError('')
    try {
      await createNamedItem(collection, name, color)
      setName('')
      await onChange(team ? 'Member added' : 'Label created')
    } catch (cause) {
      setError(errorText(cause))
    } finally { setBusy(false) }
  }

  async function remove(item: NamedItem) {
    setBusy(true)
    setError('')
    try {
      await deleteNamedItem(collection, item.id)
      setConfirm(undefined)
      await onChange(team ? 'Member removed' : 'Label removed')
    } catch (cause) {
      setError(errorText(cause))
    } finally { setBusy(false) }
  }

  return <Modal title={team ? 'Team members' : 'Manage labels'} busy={busy} onClose={onClose}>
    <div className="modal-content collection-editor">
      {error && <ErrorBox message={error} />}
      <form onSubmit={add}>
        <label className="field">{team ? 'Member name' : 'Label name'}
          <input autoFocus required value={name} maxLength={team ? 40 : 32} disabled={busy} placeholder={team ? 'e.g. Maya Chen' : 'e.g. Design'} onChange={event => setName(event.target.value)} />
        </label>
        <div className="collection-add">
          <div className="swatches" role="group" aria-label={`${noun} color`}>
            {colors.map(option => <button type="button" key={option} className={`swatch tone-${option}`} aria-pressed={color === option}
              aria-label={option} title={option} disabled={busy} onClick={() => setColor(option)}>{color === option && <Check size={15} />}</button>)}
          </div>
          <button type="submit" className="button primary" disabled={busy || !name.trim()}><Plus size={16} />{team ? 'Add member' : 'Create label'}</button>
        </div>
      </form>
      {items.length ? <ul className="collection-list">
        {items.map(item => <li key={item.id}>
          {team ? <><Avatar item={item} /><strong>{item.name}</strong></> : <Label item={item} />}
          <button type="button" className="icon-button" disabled={busy} aria-label={`Remove ${item.name}`} onClick={() => setConfirm(item)}><Trash2 size={16} /></button>
        </li>)}
      </ul> : <p className="field-note collection-empty">{team ? 'No team members yet.' : 'No labels yet.'}</p>}
      {confirm && <div className="delete-confirm">
        <p>Remove {confirm.name} from the board and any tasks using this {noun}?</p>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirm(undefined)}>Cancel</button>
        <button type="button" className="button danger" disabled={busy} onClick={() => void remove(confirm)}>Remove {noun}</button>
      </div>}
    </div>
  </Modal>
}
