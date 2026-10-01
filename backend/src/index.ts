import express from 'express'
import { clerkMiddleware, getAuth } from '@clerk/express'

const app = express()
const port = Number(process.env.PORT) || 3001

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api/tasks', clerkMiddleware(), (request, response, next) => {
  if (!getAuth(request).isAuthenticated) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

app.get('/api/tasks', (_request, response) => {
  response.status(501).json({ error: 'Task storage is not ready' })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
