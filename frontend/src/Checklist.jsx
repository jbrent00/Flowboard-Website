import { useState } from 'react'
import styles from './App.module.css'
import { createChecklistItem, deleteChecklistItem, reorderChecklistItems, updateChecklistItem } from './taskApi.js'

export default function Checklist({ task, getToken, onItemsChange, onBusyChange, disabled }) {
  const items = task.checklistItems || []
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const completed = items.filter((item) => item.completed).length
  const blocked = pending || disabled

  async function addItem(event) {
    event.preventDefault()
    if (blocked) return
    const text = newText.trim()
    if (!text || items.length >= 100) {
      setError(items.length >= 100 ? 'A checklist can have at most 100 items.' : 'Enter a checklist item.')
      return
    }
    setPending(true)
    onBusyChange(true)
    try {
      const saved = await createChecklistItem(await getToken(), task.id, text)
      onItemsChange([...items, saved])
      setNewText('')
      setError('')
    } catch {
      setError('Could not add the item. Your text is still here.')
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }

  async function saveText(event, item) {
    event.preventDefault()
    if (blocked) return
    const text = editingText.trim()
    if (!text) {
      setError('Enter checklist item text.')
      return
    }
    if (text === item.text) {
      setEditingId(null)
      setError('')
      return
    }
    setPending(true)
    onBusyChange(true)
    try {
      const saved = await updateChecklistItem(await getToken(), task.id, item.id, { text })
      onItemsChange(items.map((current) => current.id === item.id ? saved : current))
      setEditingId(null)
      setError('')
    } catch {
      setError('Could not save the item. Your edit is still here.')
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }

  async function toggleItem(item) {
    if (blocked) return
    setPending(true)
    onBusyChange(true)
    try {
      const saved = await updateChecklistItem(await getToken(), task.id, item.id, { completed: !item.completed })
      onItemsChange(items.map((current) => current.id === item.id ? saved : current))
      setError('')
    } catch {
      setError('Could not update the item. Its previous state was kept.')
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }

  async function removeItem(item) {
    if (blocked || !window.confirm(`Delete checklist item "${item.text}"?`)) return
    setPending(true)
    onBusyChange(true)
    try {
      await deleteChecklistItem(await getToken(), task.id, item.id)
      onItemsChange(items.filter((current) => current.id !== item.id))
      setError('')
    } catch {
      setError('Could not delete the item. Please try again.')
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }

  async function moveItem(index, direction) {
    if (blocked || index + direction < 0 || index + direction >= items.length) return
    const ordered = [...items]
    const [item] = ordered.splice(index, 1)
    ordered.splice(index + direction, 0, item)
    setPending(true)
    onBusyChange(true)
    try {
      const saved = await reorderChecklistItems(await getToken(), task.id, ordered.map((entry) => entry.id))
      onItemsChange(saved)
      setError('')
    } catch {
      setError('Could not reorder the checklist. Previous order was kept.')
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }

  return (
    <details className={styles.checklist} onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}>
      <summary>{items.length ? `Checklist ${completed} of ${items.length} complete` : 'Add checklist'}</summary>
      <div className={styles.checklistBody}>
        {items.length > 0 && <ul className={styles.checklistItems}>
          {items.map((item, index) => <li key={item.id}>
            <label className={styles.checklistItem}>
              <input type="checkbox" checked={item.completed} disabled={blocked} onChange={() => toggleItem(item)} />
              <span className={item.completed ? styles.checkedItem : ''}>{item.text}</span>
            </label>
            {editingId === item.id ? (
              <form className={styles.checklistEdit} onSubmit={(event) => saveText(event, item)}>
                <label htmlFor={`checklist-edit-${item.id}`}>Edit item</label>
                <input id={`checklist-edit-${item.id}`} value={editingText} maxLength={200} disabled={blocked}
                  onChange={(event) => setEditingText(event.target.value)} />
                <button type="submit" disabled={blocked}>Save</button>
                <button type="button" disabled={blocked} onClick={() => { setEditingId(null); setError('') }}>Cancel</button>
              </form>
            ) : (
              <div className={styles.checklistActions}>
                <button type="button" aria-label={`Edit ${item.text}`} disabled={blocked} onClick={() => { setEditingId(item.id); setEditingText(item.text); setError('') }}>Edit</button>
                <button type="button" aria-label={`Move ${item.text} up`} disabled={blocked || index === 0} onClick={() => moveItem(index, -1)}>Move up</button>
                <button type="button" aria-label={`Move ${item.text} down`} disabled={blocked || index === items.length - 1} onClick={() => moveItem(index, 1)}>Move down</button>
                <button type="button" aria-label={`Delete ${item.text}`} disabled={blocked} onClick={() => removeItem(item)}>Delete</button>
              </div>
            )}
          </li>)}
        </ul>}
        <form className={styles.checklistAdd} onSubmit={addItem}>
          <label htmlFor={`checklist-new-${task.id}`}>New item</label>
          <input id={`checklist-new-${task.id}`} value={newText} maxLength={200} disabled={blocked || items.length >= 100}
            onChange={(event) => setNewText(event.target.value)} />
          <button type="submit" disabled={blocked || items.length >= 100}>Add item</button>
        </form>
        {items.length >= 100 && <p>Checklist limit reached (100 items).</p>}
        {pending && <p role="status">Saving checklist...</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </details>
  )
}
