import { useState } from 'react'
import styles from './App.module.css'

const tagColors = ['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple']

export function TagBadge({ tag }) {
  return <span className={`${styles.tagBadge} ${styles[`tag_${tag.color}`]}`}>{tag.name}</span>
}

export function TagChoices({ tags, selectedIds, onChange, scope = 'personal', disabled = false }) {
  return <fieldset className={styles.tagChoices} disabled={disabled}>
    <legend>Tags (optional)</legend>
    {tags.length ? tags.map((tag) => <label key={tag.id}>
      <input type="checkbox" checked={selectedIds.includes(tag.id)} onChange={() => onChange(selectedIds.includes(tag.id)
        ? selectedIds.filter((id) => id !== tag.id) : [...selectedIds, tag.id])} />
      <TagBadge tag={tag} />
    </label>) : <span className={styles.tagHint}>{scope === 'project'
      ? 'Add a project tag to use it on tasks.' : 'Create a personal tag below to use it on tasks.'}</span>}
  </fieldset>
}

export default function TagManager({ tags, onCreate, onUpdate, onDelete, scope = 'personal' }) {
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
    const affectedTasks = scope === 'project' ? 'this project’s tasks' : 'your tasks'
    if (busy || !window.confirm(`Delete "${tag.name}"? It will be removed from ${affectedTasks}.`)) return
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
    <summary>{scope === 'project' ? 'Project tags' : 'Personal tags'} ({tags.length})</summary>
    <div className={styles.tagManagerBody}>
      {tags.length ? <ul className={styles.managedTags}>{tags.map((tag) => <li key={tag.id}>
        <TagBadge tag={tag} />
        <button type="button" disabled={busy} onClick={() => start(tag)}>Edit {tag.name}</button>
        <button type="button" disabled={busy} onClick={() => remove(tag)}>Delete {tag.name}</button>
      </li>)}</ul> : <p className={styles.tagHint}>No {scope} tags yet.</p>}
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
