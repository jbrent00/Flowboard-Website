import { useState } from 'react'
import styles from './App.module.css'

const tagColors = ['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple']

export function TagChoices({ tags, selectedIds, onChange }) {
  return <fieldset className={styles.tagChoices}>
    <legend>Tags (optional)</legend>
    {tags.length ? tags.map((tag) => <label key={tag.id}>
      <input type="checkbox" checked={selectedIds.includes(tag.id)} onChange={() => onChange(selectedIds.includes(tag.id)
        ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id])} />
      <span className={`${styles.tagBadge} ${styles[`tag_${tag.color}`]}`}>{tag.name}</span>
    </label>) : <span className={styles.tagHint}>Create a personal tag below to use it on tasks.</span>}
  </fieldset>
}

export default function TagManager({ tags, onCreate, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function start(tag) {
    setEditingId(tag?.id ?? 0)
    setName(tag?.name ?? '')
    setColor(tag?.color ?? 'blue')
    setError('')
  }

  async function save(event) {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setError('')
    try {
      if (editingId === 0) await onCreate(name.trim(), color)
      else await onUpdate(editingId, name.trim(), color)
      setEditingId(null)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(tag) {
    if (busy || !window.confirm(`Delete "${tag.name}"? It will be removed from your tasks.`)) return
    setBusy(true)
    setError('')
    try {
      await onDelete(tag.id)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <details className={styles.tagManager}>
    <summary>Personal tags ({tags.length})</summary>
    <div className={styles.tagManagerBody}>
      {tags.length ? <ul className={styles.managedTags}>{tags.map((tag) => <li key={tag.id}>
        <span className={`${styles.tagBadge} ${styles[`tag_${tag.color}`]}`}>{tag.name}</span>
        <button type="button" disabled={busy} onClick={() => start(tag)}>Edit {tag.name}</button>
        <button type="button" disabled={busy} onClick={() => remove(tag)}>Delete {tag.name}</button>
      </li>)}</ul> : <p className={styles.tagHint}>No personal tags yet.</p>}
      {editingId === null ? <button type="button" onClick={() => start(null)}>Add tag</button> :
        <form className={styles.tagEditor} onSubmit={save}>
          <label htmlFor="tag-name">Tag name</label>
          <input id="tag-name" autoFocus required maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
          <label htmlFor="tag-color">Color</label>
          <select id="tag-color" value={color} onChange={(event) => setColor(event.target.value)}>
            {tagColors.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
          </select>
          <span className={`${styles.tagBadge} ${styles[`tag_${color}`]}`}>{name.trim() || 'Preview'}</span>
          <div className={styles.tagActions}>
            <button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving...' : editingId === 0 ? 'Add tag' : 'Save tag'}</button>
            <button type="button" disabled={busy} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </form>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </details>
}
