/* Typed API client. All calls are same-origin relative URLs — the Vite dev
 * server proxies /api to the FastAPI backend, and in production the backend
 * serves the built frontend itself. No provider credentials ever exist here. */

import {
  ApiError,
  type CompareResponse,
  type ExperimentSummary,
  type PrngResult,
  type QrngBackends,
  type QrngConfig,
  type QrngJobStatus,
  type QrngMode,
  type QrngResult,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    const errorBody = (body as { error?: { code: string; message: string; hint?: string; retry_after?: number } } | null)?.error
    throw new ApiError(
      response.status,
      errorBody ?? {
        code: `HTTP_${response.status}`,
        message: `Request failed (${response.status}).`,
        hint: 'Is the backend running? See the README for startup commands.',
      },
    )
  }
  return body as T
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),

  qrngConfig: () => request<QrngConfig>('/api/qrng/config'),

  qrngBackends: () => request<QrngBackends>('/api/qrng/backends'),

  submitQrngJob: (payload: { shots: number; mode: QrngMode; backend?: string; seed?: string }) =>
    request<QrngJobStatus>('/api/qrng/jobs', { method: 'POST', body: JSON.stringify(payload) }),

  qrngJobStatus: (id: string) => request<QrngJobStatus>(`/api/qrng/jobs/${id}`),

  qrngJobResult: (id: string) => request<QrngResult>(`/api/qrng/jobs/${id}/result`),

  generatePrng: (payload: { seed: string | number; bits: number }) =>
    request<PrngResult>('/api/prng/generate', { method: 'POST', body: JSON.stringify(payload) }),

  listExperiments: (limit = 60) =>
    request<{ experiments: ExperimentSummary[] }>(`/api/experiments?limit=${limit}`),

  experimentDetail: (id: string) => request<QrngResult>(`/api/experiments/${id}`),

  compare: (payload: { bits: number; seed: string | number; qrng_experiment_id?: string }) =>
    request<CompareResponse>('/api/compare', { method: 'POST', body: JSON.stringify(payload) }),
}
