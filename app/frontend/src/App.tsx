/* App shell — masthead, hash routing, footer.
 * Routes: #/lab (default) · #/compare · #/experiments */

import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './state/store'
import { LabView } from './views/LabView'
import { CompareView } from './views/CompareView'
import { ExperimentsView } from './views/ExperimentsView'

type Route = 'lab' | 'compare' | 'experiments'

function routeFromHash(): Route {
  const h = window.location.hash.replace('#/', '')
  if (h === 'compare' || h === 'experiments') return h
  return 'lab'
}

function Shell() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const { loadExperimentIntoQrng } = useStore()

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
    <div className="frame">
      <header className="masthead">
        <div className="masthead-top">
          <div>
            <h1 className="display masthead-title">
              Quantum
              <br />
              Randomness
              <span className="thin"> Lab</span>
            </h1>
          </div>
          <div className="masthead-side">
            <span className="micro">PS AQVH910 · visual laboratory</span>
            <span className="micro">|0⟩ → H → M · source-visible randomness</span>
          </div>
        </div>
        <div className="masthead-spec">
          <span className="spec-glyphs" aria-hidden>
            {/* qubit → H → meter → bits — the whole product in four glyphs */}
            <svg width="26" height="26" viewBox="0 0 26 26">
              <circle cx="13" cy="13" r="11" fill="none" stroke="#1a1712" strokeWidth="2" />
              <circle cx="13" cy="13" r="3.5" fill="#1a1712" />
            </svg>
            <span className="mono" style={{ fontSize: 13 }}>→</span>
            <svg width="26" height="26" viewBox="0 0 26 26">
              <rect x="2" y="2" width="22" height="22" fill="#1a1712" />
              <text x="13" y="19" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="14" fontWeight="700" fill="#f4f0e6">H</text>
            </svg>
            <span className="mono" style={{ fontSize: 13 }}>→</span>
            <svg width="26" height="26" viewBox="0 0 26 26">
              <path d="M 3 18 A 10 10 0 0 1 23 18" fill="none" stroke="#ff3e00" strokeWidth="2.5" />
              <line x1="13" y1="18" x2="7" y2="25" stroke="#ff3e00" strokeWidth="2.5" />
            </svg>
            <span className="mono" style={{ fontSize: 13 }}>→</span>
            <svg width="46" height="26" viewBox="0 0 46 26">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect
                  key={i}
                  x={i * 8}
                  y={i % 2 === 0 ? 4 : 12}
                  width="6"
                  height="6"
                  fill={i % 3 === 0 ? 'none' : '#1a1712'}
                  stroke="#1a1712"
                  strokeWidth="1.5"
                />
              ))}
            </svg>
          </span>
          <nav className="mainnav">
            <a href="#/lab" className={route === 'lab' ? 'active' : ''} onClick={() => go('lab')}>
              Lab
            </a>
            <a href="#/compare" className={route === 'compare' ? 'active' : ''} onClick={() => go('compare')}>
              Compare
            </a>
            <a
              href="#/experiments"
              className={route === 'experiments' ? 'active' : ''}
              onClick={() => go('experiments')}
            >
              Experiments
            </a>
          </nav>
        </div>
      </header>

      <main style={{ paddingBottom: 20 }}>
        {route === 'lab' && <LabView />}
        {route === 'compare' && <CompareView />}
        {route === 'experiments' && <ExperimentsView onOpenInLab={openInLab} />}
      </main>

      <footer className="footer">
        <span className="micro">
          truthful provenance · hardware first · no fake status · replay never invents bits
        </span>
        <span className="micro">
          every “hardware” bit shown originates from returned QPU measurement data · credentials
          stay server-side
        </span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
