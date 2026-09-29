import { useState } from 'react'
import styles from './App.module.css'

const statuses = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

const initialTasks = [
  { id: 1, title: 'Outline project goals', status: 'todo' },
  { id: 2, title: 'Review weekly plan', status: 'todo' },
  { id: 3, title: 'Draft project update', status: 'in-progress' },
  { id: 4, title: 'Set up workspace', status: 'completed' },
]

export default function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  function handleAddTask(event) {
    event.preventDefault()
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError('Enter a task title.')
      return
    }

    setTasks((currentTasks) => [
      ...currentTasks,
      { id: crypto.randomUUID(), title: trimmedTitle, description: description.trim(), status: 'todo' },
    ])
    setTitle('')
    setDescription('')
    setError('')
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Flowboard</p>
        <h1>My tasks</h1>
        <p className={styles.intro}>A simple place to see what needs doing.</p>
      </header>

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
                      <strong>{task.title}</strong>
                      {task.description && <p className={styles.description}>{task.description}</p>}
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
