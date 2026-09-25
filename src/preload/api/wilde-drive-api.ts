import type { WildeDriveConfig } from '../../shared/wilde-drive'

/** Wilde Google Drive sidebar tab. Desktop-only, so absent from the web client's API. */
export type WildeDriveApi = {
  getConfig: () => Promise<WildeDriveConfig>
  setConfig: (update: Partial<WildeDriveConfig>) => Promise<WildeDriveConfig>
}
