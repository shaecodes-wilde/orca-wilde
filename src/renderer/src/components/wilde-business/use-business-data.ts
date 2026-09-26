import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BusinessRequest,
  BusinessResult,
  WildeBusinessApi
} from '../../../../shared/wilde/commands'
import type { BusinessSnapshot, TargetState } from '../../../../shared/wilde/domain'

export function useBusinessData(api: WildeBusinessApi | undefined) {
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null)
  const [targets, setTargets] = useState<TargetState[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<BusinessResult['preview']>()
  const mounted = useRef(false)
  const generation = useRef(0)
  const pending = useRef(false)
  const lifecycle = useRef(0)
  const context = useRef(0)
  const clearContext = useCallback(() => {
    context.current++
    setPreview(undefined)
    setMessage('')
    setError('')
  }, [])

  const apply = useCallback((result: BusinessResult, currentContext = true) => {
    if (!mounted.current) {
      return
    }
    if (result.snapshot) {
      const next = result.snapshot
      setSnapshot((previous) => (!previous || next.revision >= previous.revision ? next : previous))
    }
    if (!currentContext) {
      return
    }
    if (result.preview) {
      setPreview(result.preview)
    }
    if (['failed', 'rejected', 'stale-context'].includes(result.status)) {
      setError(result.message)
    } else {
      setMessage(result.message)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!api) {
      setLoading(false)
      return
    }
    const request = ++generation.current
    setError('')
    try {
      const [result, nextTargets] = await Promise.all([
        api.execute({ requestId: crypto.randomUUID(), command: { operation: 'snapshot' } }),
        api.targets()
      ])
      if (!mounted.current || request !== generation.current) {
        return
      }
      apply(result)
      setTargets(nextTargets)
    } catch (reason) {
      if (mounted.current && request === generation.current) {
        setError(reason instanceof Error ? reason.message : 'Could not load business records.')
      }
    } finally {
      if (mounted.current && request === generation.current) {
        setLoading(false)
      }
    }
  }, [api, apply])

  useEffect(() => {
    mounted.current = true
    const epoch = ++lifecycle.current
    void refresh()
    return () => {
      mounted.current = false
      lifecycle.current = epoch + 1
    }
  }, [refresh])

  const perform = useCallback(
    async (action: () => Promise<BusinessResult>): Promise<boolean> => {
      if (pending.current || !api) {
        return false
      }
      pending.current = true
      const epoch = lifecycle.current
      const scope = context.current
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const result = await action()
        if (epoch !== lifecycle.current || !mounted.current) {
          return false
        }
        apply(result, scope === context.current)
        return (
          scope === context.current &&
          (result.status === 'success' || result.status === 'needs-confirmation')
        )
      } catch (reason) {
        if (mounted.current && epoch === lifecycle.current && scope === context.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'The operation failed. Your records have not been confirmed saved.'
          )
        }
        return false
      } finally {
        pending.current = false
        if (mounted.current) {
          setBusy(false)
        }
      }
    },
    [api, apply]
  )

  const execute = useCallback(
    (command: BusinessRequest['command']) =>
      perform(() => {
        if (!api) {
          throw new Error('Business services are unavailable.')
        }
        return api.execute({ requestId: crypto.randomUUID(), command })
      }),
    [api, perform]
  )

  return {
    snapshot,
    targets,
    loading,
    busy,
    message,
    error,
    preview,
    setPreview,
    refresh,
    execute,
    perform,
    clearContext
  }
}
