/* Global experiment store: config, PRNG runs, active QRNG job (with honest
 * polling), and experiment history. Provider-agnostic by design. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api/client'
import {
  ApiError,
  TERMINAL_STATES,
  type ExperimentSummary,
  type PrngResult,
  type QrngBackends,
  type QrngConfig,
  type QrngJobStatus,
  type QrngMode,
  type QrngResult,
} from '../api/types'

export interface QrngSubmissionState {
  status: QrngJobStatus | null
  result: QrngResult | null
  submitting: boolean
  submitError: ApiError | null
  polling: boolean
}

export interface PrngState {
  runs: PrngResult[] // most recent first, capped
  generating: boolean
  error: ApiError | null
}

export type LabMode = 'qrng' | 'prng'

interface StoreValue {
  labMode: LabMode
  setLabMode: (m: LabMode) => void
  config: QrngConfig | null
  configError: string | null
  reloadConfig: () => Promise<void>
  backends: QrngBackends | null
  loadBackends: () => Promise<void>

  prng: PrngState
  generatePrng: (seed: string, bits: number) => Promise<void>
  clearPrngError: () => void

  qrng: QrngSubmissionState
  submitQrng: (shots: number, mode: QrngMode, backend: string, seed?: string) => Promise<void>
  loadExperimentIntoQrng: (id: string) => Promise<void>
  resetQrng: () => void
  clearQrngError: () => void

  experiments: ExperimentSummary[]
  refreshExperiments: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

const MAX_PRNG_RUNS = 4

export function StoreProvider({ children }: { children: ReactNode }) {
  const [labMode, setLabMode] = useState<LabMode>('qrng')
  const [config, setConfig] = useState<QrngConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [backends, setBackends] = useState<QrngBackends | null>(null)

  const [prngRuns, setPrngRuns] = useState<PrngResult[]>([])
  const [prngGenerating, setPrngGenerating] = useState(false)
  const [prngError, setPrngError] = useState<ApiError | null>(null)

  const [qrngStatus, setQrngStatus] = useState<QrngJobStatus | null>(null)
  const [qrngResult, setQrngResult] = useState<QrngResult | null>(null)
  const [qrngSubmitting, setQrngSubmitting] = useState(false)
  const [qrngSubmitError, setQrngSubmitError] = useState<ApiError | null>(null)
  const [qrngPolling, setQrngPolling] = useState(false)

  const [experiments, setExperiments] = useState<ExperimentSummary[]>([])

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollAbort = useRef<{ cancelled: boolean }>({ cancelled: false })

  const reloadConfig = useCallback(async () => {
    try {
      setConfig(await api.qrngConfig())
      setConfigError(null)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'backend unreachable')
    }
  }, [])

  const loadBackends = useCallback(async () => {
    try {
      setBackends(await api.qrngBackends())
    } catch {
      setBackends({ available: false, reason: 'backend unreachable', backends: [] })
    }
  }, [])

  const refreshExperiments = useCallback(async () => {
    try {
      const { experiments: list } = await api.listExperiments()
      setExperiments(list)
    } catch {
      /* history is non-critical */
    }
  }, [])

  useEffect(() => {
    void reloadConfig()
    void refreshExperiments()
  }, [reloadConfig, refreshExperiments])

  // ------------------------------------------------------------------ PRNG

  const generatePrng = useCallback(async (seed: string, bits: number) => {
    setPrngGenerating(true)
    setPrngError(null)
    try {
      const run = await api.generatePrng({ seed, bits })
      setPrngRuns((prev) => [run, ...prev].slice(0, MAX_PRNG_RUNS))
    } catch (e) {
      setPrngError(e instanceof ApiError ? e : null)
    } finally {
      setPrngGenerating(false)
      void refreshExperiments()
    }
  }, [refreshExperiments])

  // ------------------------------------------------------------------ QRNG

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    pollTimer.current = null
    pollAbort.current.cancelled = true
    setQrngPolling(false)
  }, [])

  const pollJob = useCallback(
    (id: string, attempt = 0) => {
      const ticket = { cancelled: false }
      pollAbort.current = ticket
      setQrngPolling(true)
      const tick = async () => {
        if (ticket.cancelled) return
        try {
          const status = await api.qrngJobStatus(id)
          if (ticket.cancelled) return
          setQrngStatus(status)
          if (TERMINAL_STATES.includes(status.status)) {
            setQrngPolling(false)
            if (status.status === 'COMPLETED') {
              try {
                setQrngResult(await api.qrngJobResult(id))
              } catch {
                /* result fetch failure leaves the COMPLETED status visible */
              }
            }
            void refreshExperiments()
            return
          }
        } catch {
          /* transient network error: keep polling, bounded */
        }
        if (ticket.cancelled) return
        // fast at first, gentle backoff while queued (architecture.md §8)
        const delay = Math.min(1200 + attempt * 350, 5000)
        pollTimer.current = setTimeout(() => tick(), delay)
        pollAbort.current = ticket
      }
      void tick()
    },
    [refreshExperiments],
  )

  const submitQrng = useCallback(
    async (shots: number, mode: QrngMode, backend: string, seed?: string) => {
      stopPolling()
      setQrngSubmitting(true)
      setQrngSubmitError(null)
      setQrngStatus(null)
      setQrngResult(null)
      try {
        const status = await api.submitQrngJob({ shots, mode, backend, seed })
        setQrngStatus(status)
        if (!TERMINAL_STATES.includes(status.status)) {
          pollJob(status.experiment_id)
        } else if (status.status === 'COMPLETED') {
          setQrngResult(await api.qrngJobResult(status.experiment_id))
          void refreshExperiments()
        } else {
          void refreshExperiments()
        }
      } catch (e) {
        setQrngSubmitError(e instanceof ApiError ? e : null)
      } finally {
        setQrngSubmitting(false)
        void reloadConfig() // refresh cooldown state
      }
    },
    [pollJob, refreshExperiments, reloadConfig, stopPolling],
  )

  const loadExperimentIntoQrng = useCallback(
    async (id: string) => {
      stopPolling()
      setQrngSubmitError(null)
      setQrngResult(null)
      try {
        const detail = await api.experimentDetail(id)
        if (detail.kind === 'qrng') {
          setQrngStatus(detail as QrngJobStatus)
          if (detail.status === 'COMPLETED') {
            setQrngResult(detail)
          } else if (!TERMINAL_STATES.includes(detail.status)) {
            pollJob(id)
          }
        }
      } catch (e) {
        setQrngSubmitError(e instanceof ApiError ? e : null)
      }
    },
    [pollJob, stopPolling],
  )

  const resetQrng = useCallback(() => {
    stopPolling()
    setQrngStatus(null)
    setQrngResult(null)
    setQrngSubmitError(null)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  const value = useMemo<StoreValue>(
    () => ({
      labMode,
      setLabMode,
      config,
      configError,
      reloadConfig,
      backends,
      loadBackends,
      prng: { runs: prngRuns, generating: prngGenerating, error: prngError },
      generatePrng,
      clearPrngError: () => setPrngError(null),
      qrng: {
        status: qrngStatus,
        result: qrngResult,
        submitting: qrngSubmitting,
        submitError: qrngSubmitError,
        polling: qrngPolling,
      },
      submitQrng,
      loadExperimentIntoQrng,
      resetQrng,
      clearQrngError: () => setQrngSubmitError(null),
      experiments,
      refreshExperiments,
    }),
    [
      labMode,
      config, configError, reloadConfig, backends, loadBackends,
      prngRuns, prngGenerating, prngError, generatePrng,
      qrngStatus, qrngResult, qrngSubmitting, qrngSubmitError, qrngPolling,
      submitQrng, loadExperimentIntoQrng, resetQrng, experiments, refreshExperiments,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside StoreProvider')
  return store
}
