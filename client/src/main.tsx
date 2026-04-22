import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initServiceWorker } from './offline/registerSW'
import { applyCachedThemeEagerly } from './hooks/useTheme'

// Apply the cached theme preference *before* React renders so the first
// paint matches the user's last choice — otherwise dark-mode users get a
// white flash between mount and the first server round-trip. (#138)
applyCachedThemeEagerly();

// Register the PWA service worker. No-op in dev (devOptions.enabled=false).
initServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
