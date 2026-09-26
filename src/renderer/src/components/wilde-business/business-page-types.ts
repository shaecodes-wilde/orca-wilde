import type { ReactNode } from 'react'
import type { BusinessTarget } from '../../../../shared/wilde/domain'
import type { BusinessAction } from '../../../../shared/wilde/navigation-commands'

export type BusinessPageName = 'home' | 'clients' | 'automations' | 'workspaces'
export type BusinessPageProps = {
  action?: BusinessAction
  initialPage?: BusinessPageName
  initialClientId?: string
  initialProjectId?: string
  commandSlot?: ReactNode
  onContextChange?: (context: {
    page: BusinessPageName
    clientId?: string
    projectId?: string
  }) => void
  onOpenTarget?: (target: BusinessTarget) => void
  onWorkspaces?: () => void
}

