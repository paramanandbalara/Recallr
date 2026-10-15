import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installWindowDrag } from './windowDrag'
import { installWindowResize } from './windowResize'
import { initAccount } from './services/account'
import { Root } from './Root'

installWindowDrag()
installWindowResize()

// The sign-in comes from the OS key store, so load it before the app first checks it
initAccount().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
})
