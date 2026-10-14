/* App shell — instrument header (identity · nav · truthful hardware status ·
 * PRNG/QRNG mode selector), hash routing, footer.
 * Routes: #/lab (default) · #/compare · #/experiments */

import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { ThemeProvider, useTheme } from './theme'
import { LabView } from './views/LabView'
import { CompareView } from './views/CompareView'
import { ExperimentsView } from './views/ExperimentsView'

type Route = 'lab' | 'compare' | 'experiments'

function routeFromHash(): Route {
  const h = window.location.hash.replace('#/', '')
  if (h === 'compare' || h === 'experiments') return h
  return 'lab'
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="brand-mark">
      <circle cx="15" cy="15" r="12.5" fill="none" style={{ stroke: 'var(--edge-strong)' }} strokeWidth="1.4" />
      <ellipse cx="15" cy="15" rx="12.5" ry="4.4" fill="none" style={{ stroke: 'var(--edge-strong)' }} strokeWidth="1" />
      <line x1="15" y1="2.5" x2="15" y2="27.5" style={{ stroke: 'var(--edge-bright)' }} strokeWidth="1" />
      <line x1="15" y1="15" x2="24.5" y2="7.5" style={{ stroke: 'var(--cyan)' }} strokeWidth="2" />
      <circle cx="24.5" cy="7.5" r="2.4" style={{ fill: 'var(--cyan)' }} />
      <circle cx="15" cy="2.5" r="1.5" style={{ fill: 'var(--text-0)' }} />
    </svg>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
        </svg>
      )}
    </button>
  )
}

function HardwareIndicator() {
  const { config, configError } = useStore()
  let cls = ''
  let text = 'connecting…'
  if (configError) {
    cls = 'down'
    text = 'backend unreachable'
  } else if (config) {
    if (config.hardware.available) {
      cls = 'live'
      text = `QPU ready · ${config.hardware.label}`
    } else {
      cls = 'off'
      text = 'simulator only · setup required'
    }
  }
  return (
    <span className={`hw-indicator ${cls}`} title={config?.hardware.reason ?? configError ?? ''}>
      <span className="led" />
      {text}
    </span>
  )
}

function Shell() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const { labMode, setLabMode, loadExperimentIntoQrng, config } = useStore()

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (r: Route) => {
    window.location.hash = `#/${r}`
    setRoute(r)
  }

  const openInLab = (id: string) => {
    void loadExperimentIntoQrng(id)
    go('lab')
  }

  return (
    <div>
      <header className="app-header">
        <div className="frame app-header-inner">
          <div className="brand">
            <BrandMark />
            <div className="brand-name">
              Quantum Randomness Lab
              <small>qrng · prng · provenance visible</small>
            </div>
          </div>
          <nav className="nav-tabs" aria-label="main navigation">
            {(['lab', 'compare', 'experiments'] as const).map((r) => (
              <a
                key={r}
                href={`#/${r}`}
                className={`nav-tab ${route === r ? 'active' : ''}`}
                onClick={() => go(r)}
              >
                {r}
              </a>
            ))}
          </nav>
          <div className="header-right">
            <ThemeButton />
            <HardwareIndicator />
            {route === 'lab' && (
              <div className="mode-switch" role="tablist" aria-label="lab mode">
                <button
                  role="tab"
                  aria-selected={labMode === 'prng'}
                  className={labMode === 'prng' ? 'active' : ''}
                  onClick={() => setLabMode('prng')}
                >
                  PRNG
                </button>
                <button
                  role="tab"
                  aria-selected={labMode === 'qrng'}
                  className={labMode === 'qrng' ? 'active' : ''}
                  onClick={() => setLabMode('qrng')}
                >
                  QRNG
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="tagline-strip">
        <div className="frame">
          <span>
            <b>make the generation of randomness visible</b> · |0⟩ → H → measure → bits
          </span>
          <span>
            {config?.hardware.available ? (
              <>
                hardware <b>configured</b> — every QRNG bit is a physical QPU measurement
              </>
            ) : (
              <>
                hardware <b>not configured</b> — simulator only until credentials are set
                server-side
              </>
            )}
          </span>
        </div>
      </div>

      <main className="frame" style={{ paddingBottom: 20 }}>
        {route === 'lab' && <LabView />}
        {route === 'compare' && <CompareView />}
        {route === 'experiments' && <ExperimentsView onOpenInLab={openInLab} />}
      </main>

      <footer className="footer">
        <div className="frame" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', width: '100%' }}>
          <span>
            truthful provenance · hardware first · no fake status · replay never invents bits
          </span>
          <span>
            every “hardware” bit shown originates from returned QPU measurement data ·
            credentials stay server-side
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
