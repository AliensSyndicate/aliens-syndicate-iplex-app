import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reportDevEvent, reportPageLifecycle } from '../devtools/devReport'
import { getPlatform } from '../platform'
import '../design-system/index.css'
import '../ui/tv.css'
import { LauncherApp } from './LauncherApp'

const platform = getPlatform()
// O shell é sempre a interface de TV: escala de 10 pés do Design System.
document.documentElement.setAttribute('data-iplex-platform', 'tv')
reportDevEvent('launcher-start', `${platform.id} ${platform.platformVersion ?? ''}`.trim())
reportPageLifecycle('launcher')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LauncherApp />
  </StrictMode>,
)
