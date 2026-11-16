import { useEffect, useRef, useState } from 'react'
import { listReceivedInvitations, respondToReceivedInvitation } from './projectInvitationApi.js'
import styles from './ProjectInvitations.module.css'

export default function InvitationInbox({ getToken, onJoin }) {
  const [invitations, setInvitations] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const heading = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const saved = await listReceivedInvitations(await getToken(), controller.signal)
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
  }, [getToken, attempt])

  async function respond(invitation, action, button) {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await respondToReceivedInvitation(await getToken(), invitation.id, action)
      if (action === 'accept') {
        onJoin()
        setFeedback(`Joined ${invitation.project.title}.`)
      } else {
        setFeedback(`Declined the invitation to ${invitation.project.title}.`)
      }
    } catch (cause) {
      if (cause.cause !== 404) {
        setError(cause.message)
        return
      }
      setError('This invitation is no longer available.')
    } finally {
      setBusy(false)
    }
    if (document.activeElement === button) heading.current?.focus()
    setInvitations((current) => current.filter((item) => item.id !== invitation.id))
  }

  return (
    <section className={`${styles.panel} ${styles.body} ${styles.inbox}`} aria-labelledby="invitation-inbox-title">
      <h2 id="invitation-inbox-title" ref={heading} tabIndex={-1}>Project invitations</h2>
      {status === 'loading' && <p role="status">Loading invitations...</p>}
      {status === 'error' && <p role="alert">Invitations could not be loaded. <button type="button" onClick={() => {
        setStatus('loading')
        setAttempt((value) => value + 1)
      }}>Retry</button></p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div role="status">{feedback && <p>{feedback}</p>}</div>
      {status === 'ready' && (invitations.length ? <ul className={styles.list}>
        {invitations.map((invitation) => <li key={invitation.id}>
          <div>
            <strong>{invitation.project.title}</strong>
            <div className={styles.meta}>
              {invitation.role === 'editor' ? 'Editor' : 'Viewer'} · Expires{' '}
              <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleDateString()}</time>
            </div>
          </div>
          <div className={styles.rowActions}>
            <button type="button" aria-disabled={busy} aria-label={`Accept invitation to ${invitation.project.title}`}
              onClick={(event) => respond(invitation, 'accept', event.currentTarget)}>Accept</button>
            <button type="button" aria-disabled={busy} aria-label={`Decline invitation to ${invitation.project.title}`}
              onClick={(event) => respond(invitation, 'decline', event.currentTarget)}>Decline</button>
          </div>
        </li>)}
      </ul> : <p>No pending invitations.</p>)}
    </section>
  )
}
