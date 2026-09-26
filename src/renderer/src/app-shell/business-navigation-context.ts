import { create } from 'zustand'
import type { BusinessPageName } from '@/components/wilde-business/business-page-types'

export type BusinessNavigationContext = {
  page: BusinessPageName
  clientId?: string
  projectId?: string
}

export const useBusinessNavigationContext = create<{
  current: BusinessNavigationContext | null
  returnTo: BusinessNavigationContext | null
  remember: (context: BusinessNavigationContext) => void
}>((set) => ({
  current: null,
  returnTo: null,
  remember: (returnTo) => set({ returnTo })
}))
