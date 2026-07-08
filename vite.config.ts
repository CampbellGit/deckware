import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// https://vite.dev/config/
// `base` defaults to "/" for local dev. On GitHub Pages the app is served from
// a sub-path (e.g. /deckware/), so the deploy workflow sets DEPLOY_BASE.
export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/',
  // Expose the package version to the app (shown in the toolbar).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
})
