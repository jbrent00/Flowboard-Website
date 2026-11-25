import { useEffect, useState } from 'react'
import { AssigneeChoices, TaskAssignees } from './ProjectAssignees.jsx'
import ProjectTaskComments from './ProjectTaskComments.jsx'
import { changeProjectTaskParticipation, createProjectTask, deleteProjectTask, listProjectTasks, updateProjectTask } from './projectTaskApi.js'
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

const joinDisabled = 'Your project owner has turned off joining tasks for editors.'
const leaveDisabled = 'Your project owner has turned off leaving tasks for editors.'

export default function ProjectTasks({ project, userId, getToken, members, memberStatus }) {
  const projectId = project.id
  const isOwner = !project.archivedAt && project.role === 'owner'
  const isEditor = !project.archivedAt && project.role === 'editor'
  const canCreate = isOwner || (isEditor && project.editorsCanCreateTasks)
  const canAssignOthers = isOwner || (isEditor && project.editorsCanAssignOthers)
  const canJoin = isOwner || (isEditor && project.editorsCanJoinTasks)
  const canLeave = isOwner || (isEditor && project.editorsCanLeaveTasks)
  const assignmentMembers = canAssignOthers ? members : members?.filter((member) => member.userId === userId)

  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

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
    setFeedback('')
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
      priority: task.priority, dueDate: localDate(task.dueDate), assigneeIds: null,
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

  function assignmentFields(selectedIds, currentIds = []) {
    if (memberStatus !== 'ready' || selectedIds === null) return {}
    const assigneeIds = members.filter((member) => selectedIds.includes(member.userId)).map((member) => member.userId)
    if (assigneeIds.length === currentIds.length && assigneeIds.every((id) => currentIds.includes(id))) return {}
    return { assigneeIds }
  }

  function addTask(event) {
    event.preventDefault()
    if (!valid(title, description)) return
    save(async (token) => {
      const saved = await createProjectTask(token, projectId, {
        title: title.trim(), description: description.trim(), tagIds: selectedTagIds,
        ...assignmentFields(selectedAssigneeIds),
      })
      setTasks((current) => [...current, saved])
      setTitle('')
      setDescription('')
      setSelectedTagIds([])
      setSelectedAssigneeIds([])
    }, 'create')
  }

  function saveEdit(event, task) {
    event.preventDefault()
    if (!valid(edit.title, edit.description)) return
    save(async (token) => {
      const saved = await updateProjectTask(token, projectId, editingId, {
        title: edit.title.trim(), description: edit.description.trim(), priority: edit.priority,
        dueDate: edit.dueDate ? new Date(edit.dueDate).toISOString() : null,
        tagIds: edit.tagIds,
        ...assignmentFields(edit.assigneeIds, task.assigneeIds),
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

  function changeParticipation(task, action) {
    save(async (token) => {
      replaceTask(await changeProjectTaskParticipation(token, projectId, task.id, action))
      setFeedback(action === 'join' ? `You joined "${task.title}".` : `You left "${task.title}".`)
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
    {!project.archivedAt && project.role === 'viewer' && <p>Viewers can read tasks and their assignments.</p>}
    {isEditor && !canCreate && <p>Your project owner has turned off task creation for editors.</p>}
    {isEditor && !canAssignOthers && <p>Your project owner has turned off assigning other members for editors.</p>}
    {(isOwner || isEditor) && <div className="projectTags">
      <TagManager tags={tags} scope="project" onCreate={addTag} onUpdate={editTag} onDelete={removeTag} />
    </div>}
    {canCreate && <form className="projectTaskForm" onSubmit={addTask}>
      <h2>Add project task</h2>
      <div className="projectTaskFields">
        <label htmlFor="project-task-title">Title
          <input id="project-task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required />
        </label>
        <label htmlFor="project-task-description">Description (optional)
          <textarea id="project-task-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </label>
      </div>
      <div className="projectTaskOptions">
        <TagChoices tags={tags} scope="project" selectedIds={selectedTagIds} onChange={setSelectedTagIds} disabled={busy !== null} />
        {(canAssignOthers || canJoin) && <AssigneeChoices members={assignmentMembers} status={memberStatus}
          selectedIds={selectedAssigneeIds} onChange={setSelectedAssigneeIds} disabled={busy !== null}
          lockedUserId={canJoin ? undefined : userId} lockReason={canJoin ? '' : joinDisabled} />}
      </div>
      <button type="submit" disabled={busy !== null}>Add task</button>
    </form>}
    <div role="status">{feedback}</div>
    {error && <p className="projectTaskError" role="alert">{error}</p>}
    <div className="projectBoard" aria-label="Project task board">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status)
          .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
        return (
          <section key={column.status} className="projectColumn">
            <div className="projectColumnHeader">
              <h2>{column.label}</h2>
              <span aria-label={`${columnTasks.length} ${columnTasks.length === 1 ? 'task' : 'tasks'}`}>{columnTasks.length}</span>
            </div>
            {columnTasks.length === 0 && <p>No project tasks yet.</p>}
            {columnTasks.map((task) => {
              const assigneeIds = task.assigneeIds ?? []
              const assignedToMe = assigneeIds.includes(userId)
              const canEdit = isOwner || (isEditor && (project.editorsCanEditAllTasks || assignedToMe ||
                (assigneeIds.length === 0 && task.createdById === userId)))
              const canParticipate = assignedToMe ? canLeave : canJoin
              const participationLabel = assignedToMe ? 'Leave' : 'Join'
              const participationLock = assignedToMe ? leaveDisabled : joinDisabled

              return <article className="projectTask" key={task.id}>
                {canEdit && editingId === task.id ? <form className="projectTaskEdit" onSubmit={(event) => saveEdit(event, task)}>
                  <label>Title<input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} maxLength={100} required /></label>
                  <label>Description<textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} maxLength={500} /></label>
                  <label>Priority<select value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select></label>
                  <label>Due date<input type="datetime-local" value={edit.dueDate} onChange={(event) => setEdit({ ...edit, dueDate: event.target.value })} /></label>
                  <TagChoices tags={tags} scope="project" selectedIds={edit.tagIds} disabled={busy !== null}
                    onChange={(tagIds) => setEdit({ ...edit, tagIds })} />
                  {(canAssignOthers || canParticipate) && <AssigneeChoices members={assignmentMembers} status={memberStatus}
                    disabled={busy !== null} selectedIds={edit.assigneeIds ?? assigneeIds}
                    onChange={(assigneeIds) => setEdit({ ...edit, assigneeIds })}
                    lockedUserId={canParticipate ? undefined : userId} lockReason={canParticipate ? '' : participationLock} />}
                  <div className="projectTaskActions">
                    <button type="submit" disabled={busy !== null}>Save</button>
                    <button type="button" disabled={busy !== null} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </form> : <>
                  <h3>{task.title}</h3>
                  {task.description && <p className="projectTaskDescription">{task.description}</p>}
                  <p>Priority: {task.priority}{task.dueDate ? ` · Due: ${new Date(task.dueDate).toLocaleString()}` : ''}</p>
                  <TaskAssignees members={members} assigneeIds={assigneeIds} />
                  {task.tagIds.length > 0 && <div className={styles.cardTags}>
                    {tags.filter((tag) => task.tagIds.includes(tag.id)).map((tag) => <TagBadge key={tag.id} tag={tag} />)}
                  </div>}
                  {isEditor && !canEdit && <p>You can change tasks assigned to you and unassigned tasks you created.</p>}
                  {isEditor && !canParticipate && <p>{participationLock}</p>}
                  {canEdit && <label className="projectTaskStatus">Status<select value={task.status} disabled={busy !== null} onChange={(event) => moveTask(task, event.target.value)}>
                    {columns.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
                  </select></label>}
                  {(canEdit || canParticipate) && <div className="projectTaskActions">
                    {canParticipate && <button type="button" aria-label={`${participationLabel} ${task.title}`} disabled={busy !== null}
                      onClick={() => changeParticipation(task, assignedToMe ? 'leave' : 'join')}>{participationLabel}</button>}
                    {canEdit && <>
                      <button type="button" aria-label={`Edit ${task.title}`} disabled={busy !== null} onClick={() => startEdit(task)}>Edit</button>
                      <button type="button" aria-label={`Delete ${task.title}`} disabled={busy !== null} onClick={() => removeTask(task)}>Delete</button>
                    </>}
                  </div>}
                </>}
                <ProjectTaskComments project={project} taskId={task.id} getToken={getToken} />
              </article>
            })}
          </section>
        )
      })}
    </div>
  </>
}
