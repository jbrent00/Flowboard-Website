import { useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteProject, updateProjectPolicies } from './projectLifecycleApi.js'
import styles from './ProjectInvitations.module.css'

const policyOptions = [
  ['editorsCanCreateTasks', 'Editors can create tasks'],
  ['editorsCanEditAllTasks', 'Editors can edit every task'],
  ['editorsCanAssignOthers', 'Editors can assign other members'],
  ['editorsCanJoinTasks', 'Editors can join tasks'],
  ['editorsCanLeaveTasks', 'Editors can leave tasks'],
  ['viewersCanComment', 'Viewers can comment'],
]

export default function ProjectSettings({ project, getToken, onPoliciesSaved }) {
  const navigate = useNavigate()
  const [confirmTitle, setConfirmTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [policyDraft, setPolicyDraft] = useState({})
  const [savingPolicies, setSavingPolicies] = useState(false)
  const [policyStatus, setPolicyStatus] = useState('')
  const [policyError, setPolicyError] = useState('')
  const policyChanges = Object.fromEntries(Object.entries(policyDraft).filter(([key, value]) => value !== project[key]))
  const hasPolicyChanges = Object.keys(policyChanges).length > 0

  async function savePolicies(event) {
    event.preventDefault()
    if (savingPolicies || !hasPolicyChanges) return
    setSavingPolicies(true)
    setPolicyError('')
    setPolicyStatus('')
    try {
      await updateProjectPolicies(await getToken(), project.id, policyChanges)
      onPoliciesSaved(policyChanges)
      setPolicyDraft({})
      setPolicyStatus('Permissions saved.')
    } catch (cause) {
      setPolicyError(cause.message || 'Project permissions could not be saved.')
    } finally {
      setSavingPolicies(false)
    }
  }

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
      {!project.archivedAt && <form className={styles.form} onSubmit={savePolicies}>
        <fieldset className={styles.policies} disabled={savingPolicies}>
          <legend>Project permissions</legend>
          {policyOptions.map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={Boolean(policyDraft[key] ?? project[key])} onChange={(event) => {
              const checked = event.target.checked
              setPolicyDraft((current) => ({ ...current, [key]: checked }))
              setPolicyStatus('')
              setPolicyError('')
            }} />
            {label}
          </label>)}
        </fieldset>
        <button className={styles.create} type="submit" disabled={savingPolicies || !hasPolicyChanges}>
          {savingPolicies ? 'Saving...' : 'Save permissions'}
        </button>
        <div role="status">{policyStatus && <p>{policyStatus}</p>}</div>
        {policyError && <p className={styles.error} role="alert">{policyError}</p>}
      </form>}
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
