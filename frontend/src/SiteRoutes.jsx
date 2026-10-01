import { RedirectToSignIn, SignIn, SignUp, UserButton, useAuth } from '@clerk/react'
import { Link, Navigate, Route, Routes } from 'react-router'
import App from './App.jsx'

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
  const { isLoaded, userId } = useAuth()

  if (!isLoaded) return <main className="authShell"><p>Loading your board...</p></main>
  if (!userId) return <RedirectToSignIn />

  return (
    <>
      <nav className="accountBar" aria-label="Account">
        <Link to="/">Flowboard</Link>
        <UserButton />
      </nav>
      <App key={userId} storageKey={`flowboard.tasks.v1.${userId}`} />
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
