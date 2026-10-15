import { useEffect, useState } from 'react'
import App from './App.tsx'
import { AccessGate } from './components/AccessGate'
import { uiLanguage, UI_LANGUAGE_EVENT } from './i18n'

// Changing the app's language draws every screen again in it (conversation and settings are saved, so nothing is lost)
export const Root = () => {
  const [language, setLanguage] = useState(uiLanguage)
  useEffect(() => {
    const update = () => setLanguage(uiLanguage())
    window.addEventListener(UI_LANGUAGE_EVENT, update)
    return () => window.removeEventListener(UI_LANGUAGE_EVENT, update)
  }, [])
  return (
    <AccessGate key={language}>
      <App />
    </AccessGate>
  )
}
