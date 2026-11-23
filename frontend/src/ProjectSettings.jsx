import { useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteProject } from './projectLifecycleApi.js'
import styles from './ProjectInvitations.module.css'

export default function ProjectSettings({ project, getToken }) {
  const navigate = useNavigate()
  const [confirmTitle, setConfirmTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove(event) {
    event.preventDefault()
    if (busy || confirmTitle !== project.title || !window.confirm(
      `Permanently delete "${project.title}" and all its tasks, tags, memberships, and invitations? This cannot be undone.`,
    )) return
    setBusy(true)
    setError('')
    try {
      await deleteProject(await getToken(), project.id, confirmTitle)
      navigate('/projects', { replace: true })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return <details className={styles.panel}>
    <summary>Project settings</summary>
    <div className={styles.body}>
      <h2>Delete project permanently</h2>
      <p id="project-delete-help">This deletes all project tasks, tags, memberships, and invitations. This cannot be undone.</p>
      <form className={styles.form} onSubmit={remove}>
        <label htmlFor="project-delete-title">Type {project.title} to confirm deletion</label>
        <input id="project-delete-title" aria-describedby="project-delete-help" autoComplete="off" required
          value={confirmTitle} disabled={busy} onChange={(event) => setConfirmTitle(event.target.value)} />
        <button className={styles.danger} type="submit" disabled={busy || confirmTitle !== project.title}>
          {busy ? 'Deleting...' : 'Delete project'}
        </button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </details>
}
