import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reportDevEvent, reportPageLifecycle } from './devtools/devReport'
import './ui/tv.css'
import App from './App.tsx'

reportDevEvent('frontend-start', window.location.href)
reportPageLifecycle('frontend')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
