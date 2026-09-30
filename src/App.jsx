import { useRef, useState } from 'react'
import styles from './App.module.css'

const statuses = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const priorities = ['low', 'medium', 'high']

const initialTasks = [
  { id: 1, title: 'Outline project goals', status: 'todo', priority: 'low', dueDate: '' },
  { id: 2, title: 'Review weekly plan', status: 'todo', priority: 'low', dueDate: '' },
  { id: 3, title: 'Draft project update', status: 'in-progress', priority: 'low', dueDate: '' },
  { id: 4, title: 'Set up workspace', status: 'completed', priority: 'low', dueDate: '' },
]

const storageKey = 'flowboard.tasks.v1'

function loadBoard() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { tasks: initialTasks, error: '' }
    const tasks = JSON.parse(saved)
    const valid = Array.isArray(tasks) && tasks.every((task) =>
      task && (typeof task.id === 'string' && task.id.trim() || Number.isSafeInteger(task.id)) &&
      typeof task.title === 'string' && task.title.trim() && task.title.length <= 100 &&
      (task.description === undefined || typeof task.description === 'string' && task.description.length <= 500) &&
      statuses.some((status) => status.id === task.status) && priorities.includes(task.priority) &&
      typeof task.dueDate === 'string' && (task.dueDate === '' ||
        /^\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.dueDate) && Number.isFinite(Date.parse(task.dueDate))),
    )
    if (!valid || new Set(tasks.map((task) => String(task.id))).size !== tasks.length) {
      throw new Error('Invalid saved board')
    }
    return { tasks, error: '' }
  } catch {
    return {
      tasks: initialTasks,
      error: 'Saved tasks could not be loaded. Showing samples; your next successful save will replace the saved board.',
    }
  }
}

export default function App() {
  const [savedBoard] = useState(loadBoard)
  const [tasks, setTasks] = useState(savedBoard.tasks)
  const [storageError, setStorageError] = useState(savedBoard.error)
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

  function updateTasks(nextTasks) {
    setTasks(nextTasks)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextTasks))
      setStorageError('')
    } catch {
      setStorageError('Changes could not be saved in this browser and may be lost on reload. Keep this tab open and try again.')
    }
  }

  function handleAddTask(event) {
    event.preventDefault()
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError('Enter a task title.')
      return
    }

    updateTasks([
      ...tasks,
      {
        id: crypto.randomUUID(), title: trimmedTitle, description: description.trim(),
        status: 'todo', priority, dueDate,
      },
    ])
    setTitle('')
    setDescription('')
    setPriority('low')
    setDueDate('')
    setError('')
  }

  function startEditing(task) {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditPriority(task.priority)
    setEditDueDate(task.dueDate)
    setEditError('')
  }

  function saveEdit(event) {
    event.preventDefault()
    const trimmedTitle = editTitle.trim()

    if (!trimmedTitle) {
      setEditError('Enter a task title.')
      return
    }

    updateTasks(tasks.map((task) =>
      task.id === editingId
        ? {
          ...task, title: trimmedTitle, description: editDescription.trim(),
          priority: editPriority, dueDate: editDueDate,
        }
        : task,
    ))
    setEditingId(null)
    setEditError('')
  }

  function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}" from the board?`)) {
      return
    }

    updateTasks(tasks.filter((currentTask) => currentTask.id !== task.id))
  }

  function changeStatus(taskId, newStatus) {
    statusFocusId.current = taskId
    updateTasks(tasks.map((task) =>
      task.id === taskId ? { ...task, status: newStatus } : task,
    ))
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Flowboard</p>
        <h1>My tasks</h1>
        <p className={styles.intro}>A simple place to see what needs doing.</p>
      </header>
      {storageError && <p className={styles.error} role="alert">{storageError}</p>}

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
        <button type="submit">Add task</button>
        {error && <p className={styles.error} id="task-title-error" role="alert">{error}</p>}
      </form>

      <section className={styles.board} aria-label="Task board">
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.status === status.id)

          return (
            <section className={styles.column} key={status.id} aria-labelledby={status.id}>
              <h2 id={status.id}>{status.label}</h2>
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
                            <button type="submit">Save</button>
                            <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
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
                          <button className={styles.cardAction} type="button" onClick={() => startEditing(task)}>
                            Edit {task.title}
                          </button>
                          <button className={`${styles.cardAction} ${styles.deleteButton}`} type="button" onClick={() => deleteTask(task)}>
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
