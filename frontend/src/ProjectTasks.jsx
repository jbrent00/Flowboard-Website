import { useEffect, useState } from 'react'
import { createProjectTask, deleteProjectTask, listProjectTasks, updateProjectTask } from './projectTaskApi.js'
import { createTag, deleteTag, listTags, updateTag } from './tagApi.js'
import TagManager, { TagBadge, TagChoices } from './TagManager.jsx'
import styles from './App.module.css'

const columns = [
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
]

function localDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function ProjectTasks({ projectId, getToken }) {
  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const token = await getToken()
        const [saved, projectTags] = await Promise.all([
          listProjectTasks(token, projectId), listTags(token, projectId),
        ])
        if (!controller.signal.aborted) {
          setTasks(saved)
          setTags(projectTags)
          setStatus('ready')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [projectId, getToken, attempt])

  async function save(action, label) {
    setBusy(label)
    setError('')
    try {
      await action(await getToken())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project task could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  function replaceTask(saved) {
    setTasks((current) => current.map((task) => task.id === saved.id ? saved : task))
  }

  async function addTag(name, color) {
    const saved = await createTag(await getToken(), name, color, projectId)
    setTags((current) => [...current, saved])
  }

  async function editTag(id, name, color) {
    const saved = await updateTag(await getToken(), id, name, color, projectId)
    setTags((current) => current.map((tag) => tag.id === id ? saved : tag))
  }

  async function removeTag(id) {
    await deleteTag(await getToken(), id, projectId)
    setTags((current) => current.filter((tag) => tag.id !== id))
    setSelectedTagIds((current) => current.filter((tagId) => tagId !== id))
    setEdit((draft) => draft && { ...draft, tagIds: draft.tagIds.filter((tagId) => tagId !== id) })
  }

  function startEdit(task) {
    setEditingId(task.id)
    setEdit({ title: task.title, description: task.description ?? '',
      priority: task.priority, dueDate: localDate(task.dueDate),
      tagIds: tags.filter((tag) => task.tagIds.includes(tag.id)).map((tag) => tag.id) })
    setError('')
  }

  function valid(titleValue, descriptionValue) {
    if (!titleValue.trim() || titleValue.trim().length > 100 || descriptionValue.trim().length > 500) {
      setError('Enter a title up to 100 characters and a description up to 500 characters.')
      return false
    }
    return true
  }

  function addTask(event) {
    event.preventDefault()
    if (!valid(title, description)) return
    save(async (token) => {
      const saved = await createProjectTask(token, projectId, {
        title: title.trim(), description: description.trim(), tagIds: selectedTagIds,
      })
      setTasks((current) => [...current, saved])
      setTitle('')
      setDescription('')
      setSelectedTagIds([])
    }, 'create')
  }

  function saveEdit(event) {
    event.preventDefault()
    if (!valid(edit.title, edit.description)) return
    save(async (token) => {
      const saved = await updateProjectTask(token, projectId, editingId, {
        title: edit.title.trim(), description: edit.description.trim(), priority: edit.priority,
        dueDate: edit.dueDate ? new Date(edit.dueDate).toISOString() : null,
        tagIds: edit.tagIds,
      })
      replaceTask(saved)
      setEditingId(null)
    }, editingId)
  }

  function moveTask(task, nextStatus) {
    save(async (token) => {
      replaceTask(await updateProjectTask(token, projectId, task.id, { status: nextStatus }))
    }, task.id)
  }

  function removeTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    save(async (token) => {
      await deleteProjectTask(token, projectId, task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
    }, task.id)
  }

  if (status === 'loading') return <p role="status">Loading project tasks...</p>
  if (status === 'error') return <p role="alert">Project tasks and tags could not be loaded. <button onClick={() => {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }}>Retry</button></p>

  return <>
    <TagManager tags={tags} scope="project" onCreate={addTag} onUpdate={editTag} onDelete={removeTag} />
    <form className="projectTaskForm" onSubmit={addTask}>
      <h2>Add project task</h2>
      <label htmlFor="project-task-title">Title</label>
      <input id="project-task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required />
      <label htmlFor="project-task-description">Description (optional)</label>
      <textarea id="project-task-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
      <TagChoices tags={tags} scope="project" selectedIds={selectedTagIds} onChange={setSelectedTagIds} disabled={busy !== null} />
      <button type="submit" disabled={busy !== null}>Add task</button>
    </form>
    {error && <p className="projectTaskError" role="alert">{error}</p>}
    <div className="projectBoard" aria-label="Project task board">
      {columns.map((column) => <section key={column.status} className="projectColumn">
        <h2>{column.label}</h2>
        {tasks.filter((task) => task.status === column.status).length === 0 && <p>No project tasks yet.</p>}
        {tasks.filter((task) => task.status === column.status).sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id).map((task) => <article className="projectTask" key={task.id}>
          {editingId === task.id ? <form className="projectTaskEdit" onSubmit={saveEdit}>
            <label>Title<input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} maxLength={100} required /></label>
            <label>Description<textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} maxLength={500} /></label>
            <label>Priority<select value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select></label>
            <label>Due date<input type="datetime-local" value={edit.dueDate} onChange={(event) => setEdit({ ...edit, dueDate: event.target.value })} /></label>
            <TagChoices tags={tags} scope="project" selectedIds={edit.tagIds} disabled={busy !== null}
              onChange={(tagIds) => setEdit({ ...edit, tagIds })} />
            <div className="projectTaskActions">
              <button type="submit" disabled={busy !== null}>Save</button>
              <button type="button" disabled={busy !== null} onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </form> : <>
            <h3>{task.title}</h3>
            {task.description && <p className="projectTaskDescription">{task.description}</p>}
            <p>Priority: {task.priority}{task.dueDate ? ` · Due: ${new Date(task.dueDate).toLocaleString()}` : ''}</p>
            {task.tagIds.length > 0 && <div className={styles.cardTags}>
              {tags.filter((tag) => task.tagIds.includes(tag.id)).map((tag) => <TagBadge key={tag.id} tag={tag} />)}
            </div>}
            <label className="projectTaskStatus">Status<select value={task.status} disabled={busy !== null} onChange={(event) => moveTask(task, event.target.value)}>
              {columns.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
            </select></label>
            <div className="projectTaskActions">
              <button type="button" disabled={busy !== null} onClick={() => startEdit(task)}>Edit</button>
              <button type="button" disabled={busy !== null} onClick={() => removeTask(task)}>Delete</button>
            </div>
          </>}
        </article>)}
      </section>)}
    </div>
  </>
}
