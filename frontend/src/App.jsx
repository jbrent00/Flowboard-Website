import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { createTask, deleteTask as removeTask, listTasks, updateTask } from './taskApi.js'

const statuses = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const priorities = ['low', 'medium', 'high']

export default function App({ getToken }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [boardError, setBoardError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('low')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('low')
  const [editDueDate, setEditDueDate] = useState('')
  const [editError, setEditError] = useState('')
  const statusFocusId = useRef(null)
  const editInputFocusId = useRef(null)
  const editReturnFocusId = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const saved = await listTasks(await getToken())
        if (active) setTasks(saved)
      } catch {
        if (active) setLoadError('Tasks could not be loaded. Reload the page to try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [getToken])

  async function handleAddTask(event) {
    event.preventDefault()
    if (saving) return
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError('Enter a task title.')
      return
    }

    setSaving(true)
    try {
      const saved = await createTask(await getToken(), {
        title: trimmedTitle, description: description.trim(), status: 'todo', priority, dueDate,
      })
      setTasks((current) => [...current, saved])
      setTitle('')
      setDescription('')
      setPriority('low')
      setDueDate('')
      setError('')
      setBoardError('')
    } catch {
      setError('Task could not be saved. Your entries are still here.')
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
  }

  function stopEditing() {
    editReturnFocusId.current = editingId
    setEditingId(null)
    setEditError('')
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (busyId !== null) return
    const trimmedTitle = editTitle.trim()

    if (!trimmedTitle) {
      setEditError('Enter a task title.')
      return
    }

    setBusyId(editingId)
    try {
      const saved = await updateTask(await getToken(), editingId, {
        title: trimmedTitle, description: editDescription.trim(),
        priority: editPriority, dueDate: editDueDate,
      })
      setTasks((current) => current.map((task) => task.id === editingId ? saved : task))
      setBoardError('')
      stopEditing()
    } catch {
      setEditError('Task could not be saved. Your edits are still here.')
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

  if (loading) return <main className={styles.page}><p role="status">Loading tasks...</p></main>
  if (loadError) return <main className={styles.page}><p className={styles.error} role="alert">{loadError}</p></main>

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
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'task-title-error' : undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
            }}
          />
        </div>
        <label htmlFor="task-description">Description (optional)</label>
        <textarea
          id="task-description"
          value={description}
          maxLength={500}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
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
          onChange={(event) => setDueDate(event.target.value)}
        />
        {dueDate && <button type="button" onClick={() => setDueDate('')}>Clear due date</button>}
        <button type="submit" disabled={saving}>Add task</button>
        {error && <p className={styles.error} id="task-title-error" role="alert">{error}</p>}
      </form>

      <section className={styles.board} aria-label="Task board">
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status.id)

          return (
            <section className={styles.column} key={status.id} aria-labelledby={status.id}>
              <h2 id={status.id} tabIndex={-1}>{status.label}</h2>
              {columnTasks.length > 0 ? (
                <ul className={styles.tasks}>
                  {columnTasks.map((task) => (
                    <li className={styles.task} key={task.id}>
                      {editingId === task.id ? (
                        <form className={styles.editForm} onSubmit={saveEdit}>
                          <label htmlFor={`edit-title-${task.id}`}>Task title</label>
                          <input
                            id={`edit-title-${task.id}`}
                            value={editTitle}
                            maxLength={100}
                            aria-invalid={Boolean(editError)}
                            aria-describedby={editError ? `edit-error-${task.id}` : undefined}
                            onChange={(event) => {
                              setEditTitle(event.target.value)
                              setEditError('')
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
                            onChange={(event) => setEditDescription(event.target.value)}
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
                            onChange={(event) => setEditDueDate(event.target.value)}
                          />
                          {editDueDate && <button className={styles.cardAction} type="button" onClick={() => setEditDueDate('')}>Clear due date</button>}
                          {editError && <p className={styles.error} id={`edit-error-${task.id}`} role="alert">{editError}</p>}
                          <div className={styles.editActions}>
                            <button type="submit" disabled={busyId !== null}>Save</button>
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
                <p className={styles.empty}>No tasks yet</p>
              )}
            </section>
          )
        })}
      </section>
    </main>
  )
}
