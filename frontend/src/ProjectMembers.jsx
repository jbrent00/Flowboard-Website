import { useEffect, useRef, useState } from 'react'
import { changeProjectMemberRole, listProjectMembers, removeProjectMember } from './projectMemberApi.js'
import styles from './ProjectInvitations.module.css'

const roleNames = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }

export default function ProjectMembers({ projectId, userId, isOwner, getToken }) {
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const summary = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const saved = await listProjectMembers(await getToken(), projectId, controller.signal)
        if (!controller.signal.aborted) {
          setMembers(saved)
          setStatus('ready')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    load()
    return () => controller.abort()
  }, [getToken, projectId, attempt])

  async function manageMember(member, name, role, button) {
    if (busy || (role === null && !window.confirm(`Remove ${name} from this project?`))) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const token = await getToken()
      if (role === null) {
        await removeProjectMember(token, projectId, member.userId)
        if (document.activeElement === button) summary.current?.focus()
        setMembers((current) => current.filter((item) => item.userId !== member.userId))
        setFeedback(`Removed ${name} from the project.`)
      } else {
        await changeProjectMemberRole(token, projectId, member.userId, role)
        setMembers((current) => current.map((item) => item.userId === member.userId ? { ...item, role } : item))
        setFeedback(`Updated ${name}'s role to ${roleNames[role]}.`)
      }
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className={styles.panel}>
      <summary ref={summary}>Members</summary>
      <div className={styles.body}>
        {status === 'loading' && <p role="status">Loading members...</p>}
        {status === 'error' && <p role="alert">Members could not be loaded. <button type="button" onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>Retry</button></p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div role="status">{feedback && <p>{feedback}</p>}</div>
        {status === 'ready' && <ul className={styles.list}>
          {members.map((member) => {
            const { firstName, lastName, primaryEmail } = member.user
            const fullName = [firstName, lastName].filter(Boolean).join(' ')
            const name = fullName || primaryEmail || 'Project member'
            return <li key={member.userId}>
              <div>
                <strong>{name}{member.userId === userId ? ' (you)' : ''}</strong>
                {fullName && primaryEmail && <div className={styles.meta}>{primaryEmail}</div>}
              </div>
              {isOwner && member.role !== 'owner' ? <div className={styles.rowActions}>
                <select aria-label={`Role for ${name}`} disabled={busy} value={member.role}
                  onChange={(event) => manageMember(member, name, event.target.value)}>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" aria-label={`Remove ${name}`} aria-disabled={busy}
                  onClick={(event) => manageMember(member, name, null, event.currentTarget)}>Remove</button>
              </div> : <span className={styles.meta}>{roleNames[member.role]}</span>}
            </li>
          })}
        </ul>}
      </div>
    </details>
  )
}
