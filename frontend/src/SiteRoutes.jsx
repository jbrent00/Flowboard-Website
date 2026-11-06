import { RedirectToSignIn, SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import App from './App.jsx'
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
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isLoaded || !userId) return
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
  }, [isLoaded, userId, getToken, attempt])

  if (!isLoaded) return <main className="authShell"><p>Loading projects...</p></main>
  if (!userId) return <RedirectToSignIn />

  return (
    <>
      <div className="accountBar">
        <Link to="/">Flowboard</Link>
        <WorkspaceNav />
        <UserButton />
      </div>
      <main className="projectPage">
        <h1>Projects</h1>
        {status === 'loading' && <p role="status">Loading projects...</p>}
        {status === 'error' && <p role="alert">Projects could not be loaded. <button onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>Retry</button></p>}
        {status === 'ready' && (projects.length ? (
          <ul className="projectList">
            {projects.map((project) => <li key={project.id}>
              <h2><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
              {project.description && <p>{project.description}</p>}
            </li>)}
          </ul>
        ) : <p>No projects yet.</p>)}
      </main>
    </>
  )
}

function ProjectBoard() {
  const { id } = useParams()
  const { isLoaded, userId, getToken } = useAuth()
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isLoaded || !userId) return
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
  }, [isLoaded, userId, getToken, id, attempt])

  if (!isLoaded) return <main className="authShell"><p>Loading project...</p></main>
  if (!userId) return <RedirectToSignIn />

  const currentProject = project && String(project.id) === id ? project : null
  return (
    <>
      <div className="accountBar">
        <Link to="/">Flowboard</Link>
        <WorkspaceNav />
        <UserButton />
      </div>
      <main className="projectPage">
        <Link className="projectBack" to="/projects">Back to projects</Link>
        {(status === 'loading' || (status === 'ready' && !currentProject)) && <p role="status">Loading project...</p>}
        {status === 'missing' && <p role="alert">Project not found.</p>}
        {status === 'error' && <p role="alert">Project could not be loaded. <button onClick={() => {
          setStatus('loading')
          setAttempt((value) => value + 1)
        }}>Retry</button></p>}
        {status === 'ready' && currentProject && <>
          <h1>{currentProject.title}</h1>
          {currentProject.description && <p className="projectDescription">{currentProject.description}</p>}
          <div className="projectBoard" aria-label="Project task board">
            {['To do', 'In progress', 'Completed'].map((label) => <section key={label} className="projectColumn">
              <h2>{label}</h2>
              <p>No project tasks yet.</p>
            </section>)}
          </div>
        </>}
      </main>
    </>
  )
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
