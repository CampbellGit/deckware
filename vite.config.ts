import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` defaults to "/" for local dev. On GitHub Pages the app is served from
// a sub-path (e.g. /deckware/), so the deploy workflow sets DEPLOY_BASE.
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [react()],
})
