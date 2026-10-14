import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installWindowDrag } from './windowDrag'
import { installWindowResize } from './windowResize'
import { initAccount } from './services/account'
import { AccessGate } from './components/AccessGate'

installWindowDrag()
installWindowResize()

// The sign-in comes from the OS key store, so load it before the app first checks it
initAccount().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AccessGate>
        <App />
      </AccessGate>
    </StrictMode>,
  )
})
