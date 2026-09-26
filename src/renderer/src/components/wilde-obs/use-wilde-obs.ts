import { useCallback, useEffect, useState } from 'react'
import {
  normalizeWildeObsConfig,
  type WildeObsConfig,
  type WildeObsStatus
} from '../../../../shared/wilde-obs'

export type WildeObsApiHandle = NonNullable<typeof window.api.wildeObs>

export function getWildeObsApi(): WildeObsApiHandle | null {
  return window.api?.wildeObs ?? null
}

export function useWildeObsConfig(): [
  WildeObsConfig | null,
  (update: Partial<WildeObsConfig>) => Promise<void>
] {
  const [config, setConfig] = useState<WildeObsConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    void getWildeObsApi()
      ?.getConfig()
      .then((next) => {
        if (!cancelled) {
          setConfig(next)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  const update = useCallback(async (patch: Partial<WildeObsConfig>) => {
    const next = await getWildeObsApi()?.setConfig(patch)
    if (next) {
      setConfig(next)
      window.dispatchEvent(new CustomEvent('wilde-obs-config', { detail: next }))
    }
  }, [])
  // Keep every mounted consumer (settings pane + bar) in step after an edit.
  useEffect(() => {
    const onChange = (event: Event): void => {
      if (event instanceof CustomEvent) {
        setConfig(normalizeWildeObsConfig(event.detail))
      }
    }
    window.addEventListener('wilde-obs-config', onChange)
    return () => window.removeEventListener('wilde-obs-config', onChange)
  }, [])
  return [config, update]
}

export function useWildeObsStatus(active: boolean): WildeObsStatus | null {
  const [status, setStatus] = useState<WildeObsStatus | null>(null)
  useEffect(() => (active ? getWildeObsApi()?.onStatus(setStatus) : undefined), [active])
  return status
}
