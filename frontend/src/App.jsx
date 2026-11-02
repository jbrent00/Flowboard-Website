import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { createTask, deleteTask as removeTask, listTasks, reorderTasks, updateTask } from './taskApi.js'
import { createTag, deleteTag, listTags, updateTag } from './tagApi.js'
import TagManager, { TagChoices } from './TagManager.jsx'

const statuses = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const priorities = ['low', 'medium', 'high']
const priorityRank = { high: 0, medium: 1, low: 2 }
const byTagName = (first, second) => first.name.localeCompare(second.name)

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function matchesDateView(task, view, todayKey, weekKey) {
  if (view === 'all') return true
  if (task.status === 'completed') return false
  const dueKey = task.dueDate.slice(0, 10)
  if (view === 'today') return dueKey === todayKey
  if (view === 'upcoming') return dueKey > todayKey && dueKey <= weekKey
  if (view === 'overdue') return Boolean(dueKey) && dueKey < todayKey
  return !dueKey
}

function compareTasks(first, second, sortBy) {
  if (sortBy === 'manual') return first.orderIndex - second.orderIndex ||
    first.createdAt.localeCompare(second.createdAt) || first.id - second.id

  const byTitle = first.title.localeCompare(second.title, undefined, { sensitivity: 'base' })
  if (sortBy === 'title') return byTitle || first.id - second.id

  const byPriority = priorityRank[first.priority] - priorityRank[second.priority]
  if (sortBy === 'priority') return byPriority || byTitle || first.id - second.id

  if (!first.dueDate && second.dueDate) return 1
  if (first.dueDate && !second.dueDate) return -1
  return (first.dueDate || '').localeCompare(second.dueDate || '') ||
    byPriority || byTitle || first.id - second.id
}

function validateTask(title, description, dueDate) {
  if (!title.trim()) return { field: 'title', message: 'Enter a task title.' }
  if (title.trim().length > 100) return { field: 'title', message: 'Keep the title under 100 characters.' }
  if (description.trim().length > 500) return { field: 'description', message: 'Keep the description under 500 characters.' }
  if (dueDate && !Number.isFinite(new Date(dueDate).getTime())) {
    return { field: 'dueDate', message: 'Enter a valid due date and time.' }
  }
  return null
}

export default function App({ getToken }) {
  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [boardError, setBoardError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dropTarget, setDropTarget] = useState('')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('manual')
  const [dateView, setDateView] = useState('all')
  const [today, setToday] = useState(() => new Date())
  const [priorityFilters, setPriorityFilters] = useState([])
  const [statusFilters, setStatusFilters] = useState([])
  const [tagFilters, setTagFilters] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('low')
  const [dueDate, setDueDate] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('low')
  const [editDueDate, setEditDueDate] = useState('')
  const [editTagIds, setEditTagIds] = useState([])
  const [editError, setEditError] = useState('')
  const [editErrorField, setEditErrorField] = useState('')
  const statusFocusId = useRef(null)
  const editInputFocusId = useRef(null)
  const editReturnFocusId = useRef(null)
  const searchTerm = query.trim().toLowerCase()
  const hasFilters = Boolean(searchTerm || priorityFilters.length || statusFilters.length || tagFilters.length)
  const isFiltered = hasFilters || dateView !== 'all'
  const todayKey = localDateKey(today)
  const weekKey = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7))
  const visibleTasks = isFiltered
    ? tasks.filter((task) =>
      matchesDateView(task, dateView, todayKey, weekKey) &&
      (!searchTerm || `${task.title} ${task.description}`.toLowerCase().includes(searchTerm)) &&
      (!priorityFilters.length || priorityFilters.includes(task.priority)) &&
      (!statusFilters.length || statusFilters.includes(task.status)) &&
      (!tagFilters.length || task.tags.some((tag) => tagFilters.includes(tag.id))))
    : tasks
  const canDrag = !isFiltered && sortBy === 'manual'
  const dragHint = canDrag ? 'Drag cards between columns or use their Status menus.'
    : 'To drag cards, show All tasks, choose Manual order, and clear search and filters. Status menus still work.'

  useEffect(() => {
    let timeoutId
    function scheduleMidnight() {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timeoutId = window.setTimeout(() => {
        setToday(new Date())
        scheduleMidnight()
      }, tomorrow.getTime() - now.getTime() + 1000)
    }
    scheduleMidnight()
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const token = await getToken()
        const [savedTasks, savedTags] = await Promise.all([listTasks(token), listTags(token)])
        if (active) {
          setTasks(savedTasks)
          setTags(savedTags)
        }
      } catch {
        if (active) setLoadError('Board data could not be loaded. Check your connection and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [getToken, loadAttempt])

  async function handleAddTask(event) {
    event.preventDefault()
    if (saving || busyId !== null) return
    const validation = validateTask(title, description, dueDate)
    if (validation) {
      setError(validation.message)
      setErrorField(validation.field)
      return
    }

    setSaving(true)
    try {
      const saved = await createTask(await getToken(), {
        title: title.trim(), description: description.trim(), status: 'todo', priority, dueDate,
        tagIds: selectedTagIds,
      })
      setTasks((current) => [...current, saved])
      setTitle('')
      setDescription('')
      setPriority('low')
      setDueDate('')
      setSelectedTagIds([])
      setError('')
      setErrorField('')
      setBoardError('')
    } catch {
      setError('Task could not be saved. Your entries are still here.')
      setErrorField('')
    } finally {
      setSaving(false)
    }
  }

  function startEditing(task) {
    editInputFocusId.current = task.id
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(task.dueDate)
    setEditTagIds(task.tags.map((tag) => tag.id))
    setEditError('')
    setEditErrorField('')
  }

  function stopEditing() {
    editReturnFocusId.current = editingId
    setEditingId(null)
    setEditError('')
    setEditErrorField('')
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (busyId !== null) return
    const validation = validateTask(editTitle, editDescription, editDueDate)
    if (validation) {
      setEditError(validation.message)
      setEditErrorField(validation.field)
      return
    }

    setBusyId(editingId)
    try {
      const saved = await updateTask(await getToken(), editingId, {
        title: editTitle.trim(), description: editDescription.trim(),
        priority: editPriority, dueDate: editDueDate, tagIds: editTagIds,
      })
      setTasks((current) => current.map((task) => task.id === editingId ? saved : task))
      setBoardError('')
      stopEditing()
    } catch {
      setEditError('Task could not be saved. Your edits are still here.')
      setEditErrorField('')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteTask(task) {
    if (busyId !== null) return
    if (!window.confirm(`Delete "${task.title}" from the board?`)) {
      return
    }
    setBusyId(task.id)
    try {
      await removeTask(await getToken(), task.id)
      document.getElementById(task.status)?.focus()
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setBoardError('')
    } catch {
      setBoardError('Task could not be deleted. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function addTag(name, color) {
    const saved = await createTag(await getToken(), name, color)
    setTags((current) => [...current, saved].sort(byTagName))
  }

  async function editTag(id, name, color) {
    const saved = await updateTag(await getToken(), id, name, color)
    setTags((current) => current.map((tag) => tag.id === id ? saved : tag).sort(byTagName))
    setTasks((current) => current.map((task) => ({
      ...task, tags: task.tags.map((tag) => tag.id === id ? saved : tag),
    })))
  }

  async function removeTag(id) {
    await deleteTag(await getToken(), id)
    setTags((current) => current.filter((tag) => tag.id !== id))
    setTasks((current) => current.map((task) => ({
      ...task, tags: task.tags.filter((tag) => tag.id !== id),
    })))
    setSelectedTagIds((current) => current.filter((tagId) => tagId !== id))
    setEditTagIds((current) => current.filter((tagId) => tagId !== id))
    setTagFilters((current) => current.filter((tagId) => tagId !== id))
  }

  async function changeStatus(taskId, newStatus) {
    const previous = tasks.find((item) => item.id === taskId)
    if (!previous || previous.status === newStatus || busyId !== null || saving) return
    const lastIndex = tasks.filter((item) => item.status === newStatus)
      .reduce((max, item) => Math.max(max, item.orderIndex), -1)
    setBusyId(taskId)
    const staysVisible = (!statusFilters.length || statusFilters.includes(newStatus)) &&
      matchesDateView({ ...previous, status: newStatus }, dateView, todayKey, weekKey)
    statusFocusId.current = staysVisible ? taskId : null
    setTasks((current) => current.map((item) => item.id === taskId
      ? { ...item, status: newStatus, orderIndex: lastIndex + 1 } : item))
    try {
      const saved = await updateTask(await getToken(), taskId, { status: newStatus })
      setTasks((current) => current.map((task) => task.id === taskId ? saved : task))
      setBoardError('')
    } catch {
      statusFocusId.current = taskId
      setTasks((current) => current.map((item) => item.id === taskId ? previous : item))
      setBoardError('Task status could not be saved. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function reorderColumn(taskId, targetId = null, after = false) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task || busyId !== null || saving || !canDrag) return
    const column = tasks.filter((item) => item.status === task.status)
      .sort((a, b) => a.orderIndex - b.orderIndex ||
        a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    const ids = column.map((item) => item.id).filter((id) => id !== taskId)
    const targetIndex = targetId === null ? ids.length : ids.indexOf(targetId)
    if (targetIndex < 0) return
    ids.splice(targetIndex + Number(after), 0, taskId)
    if (ids.every((id, index) => id === column[index].id)) return

    const previousOrder = new Map(column.map((item) => [item.id, item.orderIndex]))
    setBusyId(taskId)
    setTasks((current) => current.map((item) => previousOrder.has(item.id)
      ? { ...item, orderIndex: ids.indexOf(item.id) } : item))
    try {
      await reorderTasks(await getToken(), task.status, ids)
      setBoardError('')
    } catch {
      setTasks((current) => current.map((item) => previousOrder.has(item.id)
        ? { ...item, orderIndex: previousOrder.get(item.id) } : item))
      setBoardError('Task order could not be saved. Previous order restored. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  function clearDrag() {
    setDraggedId(null)
    setDropTarget('')
  }

  function dropOnColumn(event, status) {
    event.preventDefault()
    const task = tasks.find((item) => item.id === draggedId)
    clearDrag()
    if (!task || busyId !== null || saving || !canDrag) return
    if (task.status === status) reorderColumn(task.id)
    else changeStatus(task.id, status)
  }

  function dropOnCard(event, target) {
    const task = tasks.find((item) => item.id === draggedId)
    if (!task || task.status !== target.status || !canDrag) return
    event.preventDefault()
    event.stopPropagation()
    const box = event.currentTarget.getBoundingClientRect()
    const after = event.clientY > box.top + box.height / 2
    clearDrag()
    if (task.id !== target.id) reorderColumn(task.id, target.id, after)
  }

  if (loading) return <main className={styles.page}><p role="status">Loading tasks...</p></main>
  if (loadError) return (
    <main className={styles.page}>
      <p className={styles.error} role="alert">{loadError}</p>
      <button className={styles.retryButton} type="button" onClick={() => setLoadAttempt((count) => count + 1)}>Try again</button>
    </main>
  )

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Flowboard</p>
        <h1>My tasks</h1>
        <p className={styles.intro}>A simple place to see what needs doing.</p>
      </header>
      {boardError && <p className={styles.error} role="alert">{boardError}</p>}

      <form className={styles.addForm} onSubmit={handleAddTask}>
        <label htmlFor="task-title">Task title</label>
        <div className={styles.addControls}>
          <input
            id="task-title"
            type="text"
            value={title}
            maxLength={100}
            aria-invalid={errorField === 'title'}
            aria-describedby={errorField === 'title' ? 'task-form-error' : undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
              setErrorField('')
            }}
          />
        </div>
        <label htmlFor="task-description">Description (optional)</label>
        <textarea
          id="task-description"
          value={description}
          maxLength={500}
          rows={3}
          aria-invalid={errorField === 'description'}
          aria-describedby={errorField === 'description' ? 'task-form-error' : undefined}
          onChange={(event) => { setDescription(event.target.value); setError(''); setErrorField('') }}
        />
        <label className={styles.extraLabel} htmlFor="task-priority">Priority</label>
        <select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
          {priorities.map((option) => (
            <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
          ))}
        </select>
        <label className={styles.extraLabel} htmlFor="task-due-date">Due date and time (optional)</label>
        <input
          id="task-due-date"
          type="datetime-local"
          value={dueDate}
          aria-invalid={errorField === 'dueDate'}
          aria-describedby={errorField === 'dueDate' ? 'task-form-error' : undefined}
          onChange={(event) => { setDueDate(event.target.value); setError(''); setErrorField('') }}
        />
        {dueDate && <button type="button" onClick={() => setDueDate('')}>Clear due date</button>}
        <TagChoices tags={tags} selectedIds={selectedTagIds} onChange={setSelectedTagIds} />
        <button type="submit" disabled={saving || busyId !== null}>{saving ? 'Adding task...' : 'Add task'}</button>
        {error && <p className={styles.error} id="task-form-error" role="alert">{error}</p>}
      </form>

      <TagManager tags={tags} onCreate={addTag} onUpdate={editTag} onDelete={removeTag} />

      <label className={styles.dateView} htmlFor="task-view">
        Task view
        <select id="task-view" value={dateView} onChange={(event) => setDateView(event.target.value)}>
          <option value="all">All tasks</option>
          <option value="today">Due today</option>
          <option value="upcoming">Next 7 days</option>
          <option value="overdue">Overdue</option>
          <option value="unscheduled">No due date</option>
        </select>
      </label>
      <p className={styles.viewHint}>Date views show open tasks using your local date.</p>
      <label className={styles.search} htmlFor="task-search">
        Search tasks
        <input id="task-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles and descriptions" />
      </label>
      <label className={styles.sortControl} htmlFor="task-sort">
        Sort by
        <select id="task-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="manual">Manual order</option>
          <option value="priority">Priority (high first)</option>
          <option value="dueDate">Due date (soonest first)</option>
          <option value="title">Title (A to Z)</option>
        </select>
      </label>
      <section className={styles.filters} aria-label="Task filters">
        <fieldset className={styles.filterGroup}>
          <legend>Priority</legend>
          {['high', 'medium', 'low'].map((option) => (
            <label key={option}>
              <input type="checkbox" checked={priorityFilters.includes(option)} onChange={() =>
                setPriorityFilters((current) => current.includes(option)
                  ? current.filter((value) => value !== option) : [...current, option])} />
              {option[0].toUpperCase() + option.slice(1)}
            </label>
          ))}
        </fieldset>
        <fieldset className={styles.filterGroup}>
          <legend>Status</legend>
          {statuses.map((option) => (
            <label key={option.id}>
              <input type="checkbox" checked={statusFilters.includes(option.id)} onChange={() =>
                setStatusFilters((current) => current.includes(option.id)
                  ? current.filter((value) => value !== option.id) : [...current, option.id])} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <fieldset className={styles.filterGroup}>
          <legend>Tags (match any)</legend>
          {tags.length ? tags.map((tag) => (
            <label key={tag.id}>
              <input type="checkbox" checked={tagFilters.includes(tag.id)} onChange={() =>
                setTagFilters((current) => current.includes(tag.id)
                  ? current.filter((id) => id !== tag.id) : [...current, tag.id])} />
              <span className={`${styles.tagBadge} ${styles[`tag_${tag.color}`]}`}>{tag.name}</span>
            </label>
          )) : <span className={styles.tagHint}>No tags yet.</span>}
        </fieldset>
        {hasFilters && <button className={styles.clearFilters} type="button" onClick={() => {
          setQuery('')
          setPriorityFilters([])
          setStatusFilters([])
          setTagFilters([])
        }}>Clear filters</button>}
      </section>
      {isFiltered && tasks.length > 0 && <p className={styles.boardEmpty} role="status">Showing {visibleTasks.length} {visibleTasks.length === 1 ? 'task' : 'tasks'} of {tasks.length}.</p>}
      {tasks.length === 0 && <p className={styles.boardEmpty}>Your board is empty. Add a task above to get started.</p>}
      {isFiltered && tasks.length > 0 && visibleTasks.length === 0 && <p className={styles.boardEmpty}>No matching tasks. Try another search, filter, or view.</p>}
      <p className={styles.dragHint}>{dragHint}</p>
      <section className={styles.board} aria-label="Task board">
        {statuses.map((status) => {
          const columnTasks = visibleTasks
            .filter((task) => task.status === status.id)
            .sort((a, b) => compareTasks(a, b, sortBy))

          return (
            <section className={`${styles.column} ${dropTarget === status.id ? styles.dropColumn : ''}`}
              key={status.id} aria-labelledby={status.id}
              onDragOver={(event) => {
                if (draggedId === null || busyId !== null || saving || !canDrag) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (dropTarget !== status.id) setDropTarget(status.id)
              }}
              onDrop={(event) => dropOnColumn(event, status.id)}>
              <h2 id={status.id} tabIndex={-1}>{status.label}</h2>
              {columnTasks.length > 0 ? (
                <ul className={styles.tasks}>
                  {columnTasks.map((task) => (
                    <li className={`${styles.task} ${draggedId === task.id ? styles.dragging : ''}
                      ${dropTarget === `before-${task.id}` ? styles.dropBefore : ''}
                      ${dropTarget === `after-${task.id}` ? styles.dropAfter : ''}`}
                      key={task.id} draggable={editingId !== task.id && busyId === null && !saving && canDrag}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', String(task.id))
                        event.dataTransfer.effectAllowed = 'move'
                        setDraggedId(task.id)
                      }}
                      onDragEnd={clearDrag}
                      onDragOver={(event) => {
                        const source = tasks.find((item) => item.id === draggedId)
                        if (!source || source.status !== task.status || source.id === task.id || !canDrag) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                        event.stopPropagation()
                        const box = event.currentTarget.getBoundingClientRect()
                        const side = event.clientY > box.top + box.height / 2 ? 'after' : 'before'
                        const target = `${side}-${task.id}`
                        if (dropTarget !== target) setDropTarget(target)
                      }}
                      onDrop={(event) => dropOnCard(event, task)}>
                      {editingId === task.id ? (
                        <form className={styles.editForm} onSubmit={saveEdit}>
                          <label htmlFor={`edit-title-${task.id}`}>Task title</label>
                          <input
                            id={`edit-title-${task.id}`}
                            value={editTitle}
                            maxLength={100}
                            aria-invalid={editErrorField === 'title'}
                            aria-describedby={editErrorField === 'title' ? `edit-error-${task.id}` : undefined}
                            onChange={(event) => {
                              setEditTitle(event.target.value)
                              setEditError('')
                              setEditErrorField('')
                            }}
                            ref={(input) => {
                              if (input && editInputFocusId.current === task.id) {
                                input.focus()
                                editInputFocusId.current = null
                              }
                            }}
                          />
                          <label htmlFor={`edit-description-${task.id}`}>Description (optional)</label>
                          <textarea
                            id={`edit-description-${task.id}`}
                            value={editDescription}
                            maxLength={500}
                            rows={3}
                            aria-invalid={editErrorField === 'description'}
                            aria-describedby={editErrorField === 'description' ? `edit-error-${task.id}` : undefined}
                            onChange={(event) => { setEditDescription(event.target.value); setEditError(''); setEditErrorField('') }}
                          />
                          <label htmlFor={`edit-priority-${task.id}`}>Priority</label>
                          <select id={`edit-priority-${task.id}`} value={editPriority} onChange={(event) => setEditPriority(event.target.value)}>
                            {priorities.map((option) => (
                              <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
                            ))}
                          </select>
                          <label htmlFor={`edit-due-date-${task.id}`}>Due date and time (optional)</label>
                          <input
                            id={`edit-due-date-${task.id}`}
                            type="datetime-local"
                            value={editDueDate}
                            aria-invalid={editErrorField === 'dueDate'}
                            aria-describedby={editErrorField === 'dueDate' ? `edit-error-${task.id}` : undefined}
                            onChange={(event) => { setEditDueDate(event.target.value); setEditError(''); setEditErrorField('') }}
                          />
                          {editDueDate && <button className={styles.cardAction} type="button" onClick={() => setEditDueDate('')}>Clear due date</button>}
                          <TagChoices tags={tags} selectedIds={editTagIds} onChange={setEditTagIds} />
                          {editError && <p className={styles.error} id={`edit-error-${task.id}`} role="alert">{editError}</p>}
                          <div className={styles.editActions}>
                            <button type="submit" disabled={busyId !== null}>{busyId === task.id ? 'Saving...' : 'Save'}</button>
                            <button type="button" onClick={stopEditing} disabled={busyId !== null}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <strong>{task.title}</strong>
                          {task.description && <p className={styles.description}>{task.description}</p>}
                          {task.tags.length > 0 && <div className={styles.cardTags} aria-label="Tags">
                            {task.tags.map((tag) => <span className={`${styles.tagBadge} ${styles[`tag_${tag.color}`]}`} key={tag.id}>{tag.name}</span>)}
                          </div>}
                          <p className={styles.metadata}>Priority: <span className={styles.priority}>{task.priority}</span></p>
                          <p className={styles.metadata}>
                            {task.dueDate ? (
                              <>Due: <time dateTime={task.dueDate}>{new Date(task.dueDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></>
                            ) : 'No due date'}
                          </p>
                          <label className={styles.statusControl} htmlFor={`status-${task.id}`}>
                            Status
                            <select
                              id={`status-${task.id}`}
                              aria-label={`Status for ${task.title}`}
                              value={task.status}
                              onChange={(event) => changeStatus(task.id, event.target.value)}
                              disabled={busyId !== null || saving}
                              ref={(select) => {
                                // Moving columns remounts the card, so restore focus to its control.
                                if (select && statusFocusId.current === task.id) {
                                  select.focus()
                                  statusFocusId.current = null
                                }
                              }}
                            >
                              {statuses.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            className={styles.cardAction}
                            type="button"
                            onClick={() => startEditing(task)}
                            disabled={busyId !== null}
                            ref={(button) => {
                              if (button && editReturnFocusId.current === task.id) {
                                button.focus()
                                editReturnFocusId.current = null
                              }
                            }}
                          >
                            Edit {task.title}
                          </button>
                          <button className={`${styles.cardAction} ${styles.deleteButton}`} type="button" onClick={() => deleteTask(task)} disabled={busyId !== null}>
                            Delete {task.title}
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{isFiltered ? 'No matching tasks in this status' : 'No tasks in this status'}</p>
              )}
            </section>
          )
        })}
      </section>
    </main>
  )
}
