import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { BrowserRouter, useNavigate } from 'react-router'
import SiteRoutes from './SiteRoutes.jsx'
import './index.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// This entry file has no exports, so editing ClerkApp reloads the browser page.
// eslint-disable-next-line react-refresh/only-export-components
function ClerkApp() {
  const navigate = useNavigate()

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/tasks"
      signUpFallbackRedirectUrl="/tasks"
      afterSignOutUrl="/"
    >
      <SiteRoutes />
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {publishableKey ? (
      <BrowserRouter><ClerkApp /></BrowserRouter>
    ) : (
      <main className="authShell">
        <h1>Clerk setup needed</h1>
        <p>Add VITE_CLERK_PUBLISHABLE_KEY to frontend/.env.local, then restart the frontend server.</p>
      </main>
    )}
  </React.StrictMode>,
)
