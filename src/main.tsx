import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installWindowDrag } from './windowDrag'
import { initKeyStore } from './services/storage'

installWindowDrag()

// The API keys come from the OS key store, so load them before the app first reads them
initKeyStore().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
