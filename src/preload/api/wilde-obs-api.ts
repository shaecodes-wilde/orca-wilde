import type { WildeObsActionResult, WildeObsConfig, WildeObsStatus } from '../../shared/wilde-obs'

/** Wilde OBS scene bar. Desktop-only, so absent from the web client's API. */
export type WildeObsApi = {
  getConfig: () => Promise<WildeObsConfig>
  setConfig: (update: Partial<WildeObsConfig>) => Promise<WildeObsConfig>
  getStatus: () => Promise<WildeObsStatus>
  onStatus: (callback: (status: WildeObsStatus) => void) => () => void
  setScene: (sceneName: string) => Promise<WildeObsActionResult>
  toggleMic: () => Promise<WildeObsActionResult>
}
