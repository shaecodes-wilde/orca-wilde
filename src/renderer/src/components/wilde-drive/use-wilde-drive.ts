import { useCallback, useEffect, useState } from 'react'
import { normalizeWildeDriveConfig, type WildeDriveConfig } from '../../../../shared/wilde-drive'

type WildeDriveApiHandle = NonNullable<typeof window.api.wildeDrive>

export function getWildeDriveApi(): WildeDriveApiHandle | null {
  return window.api?.wildeDrive ?? null
}

const CONFIG_EVENT = 'wilde-drive-config'

/** Drive tab config (module-owned file in userData). Every mounted consumer stays in step. */
export function useWildeDriveConfig(): [
  WildeDriveConfig | null,
  (update: Partial<WildeDriveConfig>) => Promise<void>
] {
  const [config, setConfig] = useState<WildeDriveConfig | null>(null)
  useEffect(() => {
    let cancelled = false
    void getWildeDriveApi()
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
  const update = useCallback(async (patch: Partial<WildeDriveConfig>) => {
    const next = await getWildeDriveApi()?.setConfig(patch)
    if (next) {
      setConfig(next)
      window.dispatchEvent(new CustomEvent(CONFIG_EVENT, { detail: next }))
    }
  }, [])
  useEffect(() => {
    const onChange = (event: Event): void => {
      if (event instanceof CustomEvent) {
        setConfig(normalizeWildeDriveConfig(event.detail))
      }
    }
    window.addEventListener(CONFIG_EVENT, onChange)
    return () => window.removeEventListener(CONFIG_EVENT, onChange)
  }, [])
  return [config, update]
}

/** Asks for a folder and saves it as the Drive root. */
export async function pickWildeDriveRoot(
  currentRoot: string,
  update: (patch: Partial<WildeDriveConfig>) => Promise<void>
): Promise<void> {
  const picked = await window.api.shell.pickDirectory({ defaultPath: currentRoot || undefined })
  if (picked) {
    await update({ rootPath: picked })
  }
}
