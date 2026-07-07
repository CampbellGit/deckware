import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hydrateAssets } from './ui/assets'

// Load any persisted picked-image bytes from IndexedDB before the first render,
// so references like `image(photo.jpg)` resolve in the preview immediately.
hydrateAssets().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
