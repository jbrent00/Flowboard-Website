import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: browser /api requests stay on this origin; Vite forwards them to Express.
    // This avoids a client-side backend URL locally; production must route /api itself.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
