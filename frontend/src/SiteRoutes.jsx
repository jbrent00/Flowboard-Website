import { RedirectToSignIn, SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import App from './App.jsx'
import InvitationInbox from './InvitationInbox.jsx'
import ProjectInvitations from './ProjectInvitations.jsx'
import ProjectMembers from './ProjectMembers.jsx'
import ProjectSettings from './ProjectSettings.jsx'
import ProjectTasks from './ProjectTasks.jsx'
import { listProjectMembers } from './projectMemberApi.js'
import { backendBaseUrl, listTasks } from './taskApi.js'

function Home() {
  const { isLoaded, userId } = useAuth()

  if (!isLoaded) return <main className="authShell"><p>Loading...</p></main>
  if (userId) return <Navigate to="/tasks" replace />

  return (
    <main className="authShell">
      <p className="authBrand">Flowboard</p>
      <h1>Your tasks, in one place.</h1>
      <p>Sign in to open your board.</p>
      <nav className="authLinks" aria-label="Account">
        <Link to="/sign-in">Sign in</Link>
        <Link to="/sign-up">Sign up</Link>
      </nav>
    </main>
  )
}

function AuthPage({ signUp = false }) {
  return (
    <main className="authShell">
      <Link className="authBrand" to="/">Flowboard</Link>
      <div className="authWidget">{signUp ? <SignUp /> : <SignIn />}</div>
    </main>
  )
}

function WorkspaceNav() {
  return (
    <nav className="workspaceNav" aria-label="Workspace">
      <Link to="/tasks">My tasks</Link>
      <Link to="/projects">Projects</Link>
    </nav>
  )
}

function ProtectedBoard() {
  const { isLoaded, userId, getToken } = useAuth()
  const [serviceStatus, setServiceStatus] = useState('')
  const [checkingService, setCheckingService] = useState(false)

  useEffect(() => {
    if (!isLoaded || !userId || !backendBaseUrl) return
    const controller = new AbortController()

    async function syncUser() {
      try {
        const token = await getToken()
        if (!token || controller.signal.aborted) return
        const response = await fetch(`${backendBaseUrl}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!response.ok) setServiceStatus('Your profile could not be saved. Please reload to retry.')
      } catch {
        if (!controller.signal.aborted) setServiceStatus('Your profile could not be saved. Please reload to retry.')
      }
    }

    syncUser()
    return () => controller.abort()
  }, [isLoaded, userId, getToken])

  async function checkTaskService() {
    if (!backendBaseUrl) {
      setServiceStatus('Set VITE_BACKEND_BASE_URL in frontend/.env.local and restart the frontend.')
      return
    }

    setCheckingService(true)
    setServiceStatus('Checking task service...')
    try {
      const token = await getToken()
      if (!token) {
        setServiceStatus('Sign in again to check the task service.')
        return
      }
      const tasks = await listTasks(token)
      setServiceStatus(`Task service connected. ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} saved on the server.`)
    } catch (error) {
      setServiceStatus(error instanceof Error && error.message.startsWith('Task service returned')
        ? error.message
        : 'Could not reach the task service. Check the backend URL and allowed origin.')
    } finally {
      setCheckingService(false)
    }
  }

  if (!isLoaded) return <main className="authShell"><p>Loading your board...</p></main>
  if (!userId) return <RedirectToSignIn />

  return (
    <>
      <div className="accountBar">
        <Link to="/">Flowboard</Link>
        <WorkspaceNav />
        <div className="accountActions">
          <button type="button" onClick={checkTaskService} disabled={checkingService}>Check task service</button>
          <UserButton />
        </div>
      </div>
      {serviceStatus && <p className="serviceStatus" role="status">{serviceStatus}</p>}
      <App key={userId} getToken={getToken} />
    </>
  )
}

function ProjectList() {
  const { isLoaded, userId, getToken } = useAuth()
  if (!isLoaded) return <main className="authShell"><p>Loading projects...</p></main>
  if (!userId) return <RedirectToSignIn />

  return <MemberProjectList key={userId} getToken={getToken} />
}

function MemberProjectList({ getToken }) {
  const [projects, setProjects] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const visibleProjects = projects.filter((project) => Boolean(project.archivedAt) === showArchived)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProjects() {
      try {
        const token = await getToken()
        if (!token || !backendBaseUrl) throw new Error('Project service unavailable')
        const response = await fetch(`${backendBaseUrl}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (!response.ok) throw new Error('Project service unavailable')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('Invalid project list')
        if (!controller.signal.aborted) {
          setProjects(data)
          setStatus('ready')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    loadProjects()
    return () => controller.abort()
  }, [getToken, attempt])

  return (
    <>
      <div className="accountBar projectAccountBar">
        <Link to="/">Flowboard</Link>
        <WorkspaceNav />
        <UserButton />
      </div>
      <main className="projectPage">
        <h1>Projects</h1>
        <InvitationInbox getToken={getToken} onJoin={() => setAttempt((value) => value + 1)} />
        {status === 'loading' && <p role="status">Loading projects...</p>}
        {status === 'error' && <p role="alert">Projects could not be loaded. <button onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>Retry</button></p>}
        {status === 'ready' && <>
          <button type="button" className="projectArchiveAction" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Show active projects' : 'Show archived projects'}
          </button>
          {visibleProjects.length ? <ul className="projectList" aria-label={showArchived ? 'Archived projects' : 'Active projects'}>
            {visibleProjects.map((project) => <li key={project.id}>
              <h2><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
              {project.description && <p>{project.description}</p>}
            </li>)}
          </ul> : <p>{showArchived ? 'No archived projects.' : 'No active projects.'}</p>}
        </>}
      </main>
    </>
  )
}

function ProjectBoard() {
  const { id } = useParams()
  const { isLoaded, userId, getToken } = useAuth()
  if (!isLoaded) return <main className="authShell"><p>Loading project...</p></main>
  if (!userId) return <RedirectToSignIn />

  return <MemberProjectBoard key={`${userId}:${id}`} id={id} userId={userId} getToken={getToken} />
}

function MemberProjectBoard({ id, userId, getToken }) {
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [projectFeedback, setProjectFeedback] = useState('')
  const heading = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProject() {
      try {
        const token = await getToken()
        if (!token || !backendBaseUrl) throw new Error('Project service unavailable')
        const response = await fetch(`${backendBaseUrl}/api/projects/${id}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (response.status === 404 || response.status === 400) {
          if (!controller.signal.aborted) setStatus('missing')
          return
        }
        if (!response.ok) throw new Error('Project service unavailable')
        const data = await response.json()
        if (!controller.signal.aborted) {
          setProject(data)
          setStatus('ready')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }
    loadProject()
    return () => controller.abort()
  }, [getToken, id, attempt])

  async function changeArchiveState() {
    setArchiveBusy(true)
    setArchiveError('')
    try {
      const token = await getToken()
      const response = await fetch(`${backendBaseUrl}/api/projects/${id}/archive`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !project.archivedAt }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setProject((current) => ({ ...current, archivedAt: result.archivedAt }))
    } catch (error) {
      setArchiveError(error.message || 'Project archive state could not be saved.')
    } finally {
      setArchiveBusy(false)
    }
  }

  return (
    <>
      <div className="accountBar projectAccountBar">
        <Link to="/">Flowboard</Link>
        <WorkspaceNav />
        <UserButton />
      </div>
      <main className="projectPage">
        <Link className="projectBack" to="/projects">Back to projects</Link>
        {status === 'loading' && <p role="status">Loading project...</p>}
        {status === 'missing' && <p role="alert">Project not found.</p>}
        {status === 'error' && <p role="alert">Project could not be loaded. <button onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>Retry</button></p>}
        {status === 'ready' && project && <>
          <header className="projectHeader">
            <div className="projectHeading">
              <h1 ref={heading} tabIndex={-1}>{project.title}</h1>
              {project.description && <p className="projectDescription">{project.description}</p>}
            </div>
            {project.role === 'owner' && <button type="button" className="projectArchiveAction" disabled={archiveBusy} onClick={changeArchiveState}>
              {project.archivedAt ? 'Restore project' : 'Archive project'}
            </button>}
          </header>
          {project.archivedAt && <p role="status">This project is archived.</p>}
          {archiveError && <p className="projectTaskError" role="alert">{archiveError}</p>}
          <div role="status">{projectFeedback && <p>{projectFeedback}</p>}</div>
          <ProjectWorkspace key={`${Boolean(project.archivedAt)}:${project.role}`} project={project} userId={userId} getToken={getToken}
            onPoliciesSaved={(changes) => setProject((current) => ({ ...current, ...changes }))}
            onTransfer={() => {
              setProject((current) => ({ ...current, role: 'editor' }))
              setProjectFeedback('Ownership transferred. You are now an editor.')
              heading.current?.focus()
            }} />
        </>}
      </main>
    </>
  )
}

function ProjectWorkspace({ project, userId, getToken, onTransfer, onPoliciesSaved }) {
  const [members, setMembers] = useState(null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const isOwner = !project.archivedAt && project.role === 'owner'
  const projectId = project.id

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

  function retry() {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }

  return <>
    <div className="projectManagement">
      <ProjectMembers projectId={projectId} userId={userId} isOwner={isOwner} getToken={getToken}
        members={members} setMembers={setMembers} status={status} retry={retry} onTransfer={onTransfer} />
      {isOwner && <ProjectInvitations projectId={projectId} getToken={getToken} />}
      {project.role === 'owner' && <ProjectSettings project={project} getToken={getToken} onPoliciesSaved={onPoliciesSaved} />}
    </div>
    <ProjectTasks projectId={projectId} getToken={getToken} canEdit={!project.archivedAt && (isOwner || project.role === 'editor')}
      canAssign={isOwner} members={members} memberStatus={status} />
  </>
}

export default function SiteRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in/*" element={<AuthPage />} />
      <Route path="/sign-up/*" element={<AuthPage signUp />} />
      <Route path="/tasks" element={<ProtectedBoard />} />
      <Route path="/projects" element={<ProjectList />} />
      <Route path="/projects/:id" element={<ProjectBoard />} />
      <Route path="*" element={<main className="authShell"><h1>Page not found</h1><Link to="/">Go home</Link></main>} />
    </Routes>
  )
}
