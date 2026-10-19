import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reportDevEvent, reportPageLifecycle } from '../devtools/devReport'
import { getPlatform } from '../platform'
import '../ui/tv.css'
import { LauncherApp } from './LauncherApp'

const platform = getPlatform()
reportDevEvent('launcher-start', `${platform.id} ${platform.platformVersion ?? ''}`.trim())
reportPageLifecycle('launcher')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LauncherApp />
  </StrictMode>,
)
