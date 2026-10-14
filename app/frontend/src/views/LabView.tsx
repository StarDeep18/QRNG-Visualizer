/* The Lab — the single-screen demo experience (PRD §7/§8.1).
 * The PRNG/QRNG mode selector lives in the app header (store.labMode);
 * this view just renders the active panel. No hunting for anything. */

import { useStore } from '../state/store'
import { PrngPanel } from './PrngPanel'
import { QrngPanel } from './QrngPanel'

export function LabView() {
  const { labMode } = useStore()
  return labMode === 'prng' ? <PrngPanel /> : <QrngPanel />
}
