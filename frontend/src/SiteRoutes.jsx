import { RedirectToSignIn, SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router'
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
      <nav className="accountBar" aria-label="Account">
        <Link to="/">Flowboard</Link>
        <div className="accountActions">
          <button type="button" onClick={checkTaskService} disabled={checkingService}>Check task service</button>
          <UserButton />
        </div>
      </nav>
      {serviceStatus && <p className="serviceStatus" role="status">{serviceStatus}</p>}
      <App key={userId} getToken={getToken} />
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
      <Route path="*" element={<main className="authShell"><h1>Page not found</h1><Link to="/">Go home</Link></main>} />
    </Routes>
  )
}
