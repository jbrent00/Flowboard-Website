import express from 'express'
import { clerkMiddleware, getAuth } from '@clerk/express'
import { verifyWebhook } from '@clerk/express/webhooks'
import { syncClerkUser } from './userProfile.js'
import { taskRoutes } from './tasks.js'

const app = express()
const port = Number(process.env.PORT) || 3001
const frontendOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean)

app.use('/api', (request, response, next) => {
  const origin = request.get('Origin')
  response.vary('Origin')
  if (origin && frontendOrigins.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin)
  }

  if (request.method === 'OPTIONS') {
    if (!origin || !frontendOrigins.includes(origin)) {
      response.sendStatus(403)
      return
    }
    response.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.sendStatus(204)
    return
  }
  next()
})

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.post('/api/webhooks', express.raw({ type: 'application/json' }), async (request, response) => {
  let event
  try {
    event = await verifyWebhook(request)
  } catch {
    response.sendStatus(400)
    return
  }
  if (event.type !== 'user.created' && event.type !== 'user.updated') {
    response.sendStatus(204)
    return
  }
  try {
    await syncClerkUser(event.data.id)
    response.sendStatus(204)
  } catch (error) {
    console.error('User webhook sync failed', error)
    response.sendStatus(503)
  }
})

app.get('/api/me', clerkMiddleware(), async (request, response) => {
  const { isAuthenticated, userId } = getAuth(request)
  if (!isAuthenticated || !userId) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const user = await syncClerkUser(userId)
    response.json({ id: user.id })
  } catch (error) {
    console.error('User synchronization failed', error)
    response.status(503).json({ error: 'User profile could not be saved' })
  }
})

app.use('/api/tasks', clerkMiddleware(), (request, response, next) => {
  if (!getAuth(request).isAuthenticated) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

app.use('/api/tasks', express.json({ limit: '16kb' }), taskRoutes)

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
