import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { createTask, deleteTask as removeTask, listTasks, reorderTasks, updateTask } from './taskApi.js'

const statuses = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const priorities = ['low', 'medium', 'high']

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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [boardError, setBoardError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dropTarget, setDropTarget] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('low')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('low')
  const [editDueDate, setEditDueDate] = useState('')
  const [editError, setEditError] = useState('')
  const [editErrorField, setEditErrorField] = useState('')
  const statusFocusId = useRef(null)
  const editInputFocusId = useRef(null)
  const editReturnFocusId = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const saved = await listTasks(await getToken())
        if (active) setTasks(saved)
      } catch {
        if (active) setLoadError('Tasks could not be loaded. Check your connection and try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [getToken, loadAttempt])

  async function handleAddTask(event) {
    event.preventDefault()
    if (saving) return
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
      })
      setTasks((current) => [...current, saved])
      setTitle('')
      setDescription('')
      setPriority('low')
      setDueDate('')
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
        priority: editPriority, dueDate: editDueDate,
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

  async function changeStatus(taskId, newStatus) {
    if (busyId !== null) return
    setBusyId(taskId)
    try {
      const saved = await updateTask(await getToken(), taskId, { status: newStatus })
      statusFocusId.current = taskId
      setTasks((current) => current.map((task) => task.id === taskId ? saved : task))
      setBoardError('')
    } catch {
      setBoardError('Task status could not be saved. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function reorderColumn(taskId, targetId = null, after = false) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task || busyId !== null) return
    const column = tasks.filter((item) => item.status === task.status)
      .sort((a, b) => a.orderIndex - b.orderIndex ||
        a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    const ids = column.map((item) => item.id).filter((id) => id !== taskId)
    const targetIndex = targetId === null ? ids.length : ids.indexOf(targetId)
    if (targetIndex < 0) return
    ids.splice(targetIndex + Number(after), 0, taskId)
    if (ids.every((id, index) => id === column[index].id)) return

    setBusyId(taskId)
    try {
      await reorderTasks(await getToken(), task.status, ids)
      setTasks((current) => current.map((item) => item.status === task.status && ids.includes(item.id)
        ? { ...item, orderIndex: ids.indexOf(item.id) } : item))
      setBoardError('')
    } catch {
      setBoardError('Task order could not be saved. Reload and try again.')
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
    if (!task || busyId !== null) return
    if (task.status === status) reorderColumn(task.id)
    else changeStatus(task.id, status)
  }

  function dropOnCard(event, target) {
    const task = tasks.find((item) => item.id === draggedId)
    if (!task || task.status !== target.status) return
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
        <button type="submit" disabled={saving}>{saving ? 'Adding task...' : 'Add task'}</button>
        {error && <p className={styles.error} id="task-form-error" role="alert">{error}</p>}
      </form>

      {tasks.length === 0 && <p className={styles.boardEmpty}>Your board is empty. Add a task above to get started.</p>}
      <p className={styles.dragHint}>Drag cards between columns or use their Status menus.</p>
      <section className={styles.board} aria-label="Task board">
        {statuses.map((status) => {
          const columnTasks = tasks
            .filter((task) => task.status === status.id)
            .sort((a, b) => a.orderIndex - b.orderIndex ||
              a.createdAt.localeCompare(b.createdAt) || a.id - b.id)

          return (
            <section className={`${styles.column} ${dropTarget === status.id ? styles.dropColumn : ''}`}
              key={status.id} aria-labelledby={status.id}
              onDragOver={(event) => {
                if (draggedId === null || busyId !== null) return
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
                      key={task.id} draggable={editingId !== task.id && busyId === null}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', String(task.id))
                        event.dataTransfer.effectAllowed = 'move'
                        setDraggedId(task.id)
                      }}
                      onDragEnd={clearDrag}
                      onDragOver={(event) => {
                        const source = tasks.find((item) => item.id === draggedId)
                        if (!source || source.status !== task.status || source.id === task.id) return
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
                              disabled={busyId !== null}
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
                <p className={styles.empty}>No tasks in this status</p>
              )}
            </section>
          )
        })}
      </section>
    </main>
  )
}
