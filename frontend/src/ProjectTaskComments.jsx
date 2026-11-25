import { useEffect, useState } from 'react'
import { createProjectTaskComment, listProjectTaskComments } from './projectTaskApi.js'

export default function ProjectTaskComments({ project, taskId, getToken }) {
  const [open, setOpen] = useState(false)
  const readOnly = project.archivedAt ? 'This archived project is read-only.' :
    project.role === 'viewer' && !project.viewersCanComment ? 'The project owner has turned off viewer comments.' : ''

  return <details className="projectTaskComments" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Discussion</summary>
    {open && <Discussion projectId={project.id} taskId={taskId} getToken={getToken} readOnly={readOnly} />}
  </details>
}

function Discussion({ projectId, taskId, getToken, readOnly }) {
  const [comments, setComments] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [posted, setPosted] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const items = await listProjectTaskComments(await getToken(), projectId, taskId, controller.signal)
        if (controller.signal.aborted) return
        setComments(items)
        setStatus('ready')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [getToken, projectId, taskId, attempt])

  async function post(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || saving || readOnly) return
    setSaving(true)
    setError('')
    setPosted(false)
    try {
      const comment = await createProjectTaskComment(await getToken(), projectId, taskId, body)
      setComments((current) => [...current, comment])
      setDraft('')
      setPosted(true)
    } catch (cause) {
      setError(cause.message || 'Comment could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <p role="status">Loading comments...</p>
  if (status === 'error') return <>
    <p role="alert">Comments could not be loaded.</p>
    <button type="button" onClick={() => {
      setStatus('loading')
      setAttempt((value) => value + 1)
    }}>Retry</button>
  </>

  return <>
    {comments.length ? <ol>{comments.map(({ id, author, createdAt, body }) => <li key={id}>
      <p><strong>{[author.firstName, author.lastName].filter(Boolean).join(' ') || 'Member'}</strong>
        {' · '}<time dateTime={createdAt}>{new Date(createdAt).toLocaleString()}</time></p>
      <p className="projectCommentBody">{body}</p>
    </li>)}</ol> : <p>No comments yet.</p>}
    {readOnly ? <p>{readOnly}</p> : <form className="projectTaskEdit" onSubmit={post}>
      <label>Comment
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} disabled={saving} required />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="projectTaskActions">
        <button type="submit" disabled={saving || !draft.trim()}>{saving ? 'Posting...' : 'Post comment'}</button>
      </div>
      <div role="status">{posted && 'Comment posted.'}</div>
    </form>}
  </>
}
