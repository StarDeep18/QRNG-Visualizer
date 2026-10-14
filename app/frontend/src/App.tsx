/* App shell — sticky instrument header (brand · nav · truthful QPU status
 * · theme toggle), hash routing, one-line footer.
 * Routes: #/lab (default) · #/compare · #/experiments
 * #/lab?id=EXP-… loads a stored experiment into the lab. */

import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { ThemeProvider, useTheme } from './theme'
import { LabView } from './views/LabView'
import { CompareView } from './views/CompareView'
import { ExperimentsView } from './views/ExperimentsView'

type Route = 'lab' | 'compare' | 'experiments'

function routeFromHash(): Route {
  const h = window.location.hash.replace('#/', '').split('?')[0]
  if (h === 'compare' || h === 'experiments') return h
  return 'lab'
}

function idFromHash(): string | null {
  const m = window.location.hash.match(/[?&]id=([A-Za-z0-9-]+)/)
  return m ? m[1] : null
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden className="brand-mark">
      <circle cx="15" cy="15" r="12.5" fill="none" stroke="var(--text-2)" strokeWidth="1.4" />
      <ellipse cx="15" cy="15" rx="12.5" ry="4.4" fill="none" stroke="var(--text-2)" strokeWidth="1" />
      <line x1="15" y1="2.5" x2="15" y2="27.5" stroke="var(--text-3)" strokeWidth="1" />
      <line x1="15" y1="15" x2="24.5" y2="7.5" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="24.5" cy="7.5" r="2.4" fill="var(--accent)" />
    </svg>
  )
}

function QpuChip() {
  const { config, configError } = useStore()
  let cls = ''
  let text = 'connecting…'
  if (configError) {
    cls = 'down'
    text = 'offline'
  } else if (config) {
    if (config.hardware.available) {
      cls = 'live'
      text = `QPU · ${config.hardware.label}`
    } else {
      cls = 'off'
      text = 'simulator only'
    }
  }
  return (
    <span className={`qpu-chip ${cls}`} title={config?.hardware.reason ?? configError ?? ''}>
      <span className="led" />
      {text}
    </span>
  )
}

function ThemeButton() {
  const { theme, toggle } = useTheme()
  return (
    <button
      className="theme-btn"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'switch to light mode' : 'switch to dark mode'}
      title={theme === 'dark' ? 'light mode' : 'dark mode'}
    >
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
        </svg>
      )}
    </button>
  )
}

function Shell() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const { loadExperimentIntoQrng } = useStore()

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash())
      const id = idFromHash()
      if (id) void loadExperimentIntoQrng(id)
    }
    window.addEventListener('hashchange', onHash)
    const id = idFromHash()
    if (id) void loadExperimentIntoQrng(id)
    return () => window.removeEventListener('hashchange', onHash)
  }, [loadExperimentIntoQrng])

  const openInLab = (id: string) => {
    window.location.hash = `#/lab?id=${id}`
  }

  return (
    <div className="frame">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="brand">
            <BrandMark />
            <span className="brand-name">Quantum Randomness Lab</span>
          </span>

          <nav className="nav-tabs" aria-label="sections">
            <a
              className={`nav-tab ${route === 'lab' ? 'active' : ''}`}
              href="#/lab"
            >
              lab
            </a>
            <a
              className={`nav-tab ${route === 'compare' ? 'active' : ''}`}
              href="#/compare"
            >
              compare
            </a>
            <a
              className={`nav-tab ${route === 'experiments' ? 'active' : ''}`}
              href="#/experiments"
            >
              experiments
            </a>
          </nav>

          <span className="header-right">
            <QpuChip />
            <ThemeButton />
          </span>
        </div>
      </header>

      <main>
        {route === 'lab' && <LabView />}
        {route === 'compare' && <CompareView />}
        {route === 'experiments' && <ExperimentsView onOpenInLab={openInLab} />}
      </main>

      <footer className="footer">
        <div className="frame">
          <span className="micro">
            every number is a real returned result — simulator runs are always labelled ·
            quantum jobs via server-side provider credentials
          </span>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ThemeProvider>
  )
}
