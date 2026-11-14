import { useEffect, useRef, useState } from 'react'
import { createProjectInvitation, listProjectInvitations, revokeProjectInvitation } from './projectInvitationApi.js'
import styles from './ProjectInvitations.module.css'

export default function ProjectInvitations({ projectId, getToken }) {
  const [invitations, setInvitations] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const pendingHeading = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const token = await getToken()
        const saved = await listProjectInvitations(token, projectId, controller.signal)
        if (!controller.signal.aborted) {
          setInvitations(saved)
          setStatus('ready')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [getToken, projectId, attempt])

  async function createInvitation(event) {
    event.preventDefault()
    if (busy !== null) return
    setBusy('create')
    setError('')
    setFeedback('')
    try {
      const saved = await createProjectInvitation(await getToken(), projectId, email.trim(), role)
      setInvitations((current) => [saved, ...current])
      setEmail('')
      setFeedback(`Invitation created for ${saved.email}.`)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(null)
    }
  }

  async function revokeInvitation(invitation, button) {
    if (busy !== null || !window.confirm(`Revoke the invitation for ${invitation.email}?`)) return
    setBusy(invitation.id)
    setError('')
    setFeedback('')
    try {
      await revokeProjectInvitation(await getToken(), projectId, invitation.id)
      if (document.activeElement === button) pendingHeading.current?.focus()
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setFeedback(`Invitation revoked for ${invitation.email}.`)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className={styles.panel}>
      <summary>Project invitations</summary>
      <div className={styles.body}>
        {status === 'loading' && <p role="status">Loading invitations...</p>}
        {status === 'error' && <>
          <p role="alert">Invitations could not be loaded.</p>
          <button type="button" onClick={() => {
            setStatus('loading')
            setAttempt((value) => value + 1)
          }}>Retry</button>
        </>}
        {status === 'ready' && <>
          <form className={styles.form} onSubmit={createInvitation}>
            <label htmlFor="invite-email">Email address</label>
            <input id="invite-email" type="email" autoComplete="email" required maxLength={254}
              value={email} readOnly={busy === 'create'} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" value={role} disabled={busy === 'create'} onChange={(event) => setRole(event.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button type="submit" className={styles.create} aria-disabled={busy !== null}>
              {busy === 'create' ? 'Creating...' : 'Create invitation'}
            </button>
          </form>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div role="status">{feedback && <p>{feedback}</p>}</div>
          <h2 ref={pendingHeading} tabIndex={-1}>Pending invitations</h2>
          {invitations.length === 0 ? <p>No pending invitations.</p> : (
            <ul className={styles.list}>
              {invitations.map((invitation) => <li key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <div className={styles.meta}>
                    {invitation.role === 'editor' ? 'Editor' : 'Viewer'} · Expires{' '}
                    <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleDateString()}</time>
                  </div>
                </div>
                <button type="button" aria-label={`Revoke invitation for ${invitation.email}`} aria-disabled={busy !== null}
                  onClick={(event) => revokeInvitation(invitation, event.currentTarget)}>
                  {busy === invitation.id ? 'Revoking...' : 'Revoke'}
                </button>
              </li>)}
            </ul>
          )}
        </>}
      </div>
    </details>
  )
}
