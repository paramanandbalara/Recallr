import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installWindowDrag } from './windowDrag'
import { installWindowResize } from './windowResize'
import { initAccount } from './services/account'
import { startProfileSync } from './services/profileSync'
import { startInterviewSync } from './services/interviewSync'
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
  startProfileSync() // Keeps a copy of the profiles on the account, in the background
  startInterviewSync() // ...and the interview calendar, for reminders and the website
})
