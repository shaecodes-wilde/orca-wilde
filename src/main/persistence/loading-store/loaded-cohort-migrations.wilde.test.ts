import { describe, expect, it } from 'vitest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  NEW_WILDE_PROFILE_APPEARANCE,
  NEW_WILDE_PROFILE_TERMINAL_THEME_DARK
} from '../../../shared/wilde-appearance'
import { LoadedCohortMigrationOperations } from './loaded-cohort-migrations'

function stateWith(settings: Record<string, unknown>): PersistedState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: seedWildeAppearance only reads and spreads `settings`; the rest of the state is irrelevant here.
  return { settings } as unknown as PersistedState
}

describe('seedWildeAppearance', () => {
  it('turns Wilde on for an existing stock profile without touching its terminal theme', () => {
    const runtime = { loadNeedsSave: false }
    const seeded = new LoadedCohortMigrationOperations(runtime).seedWildeAppearance(
      stateWith({ terminalThemeDark: 'Dracula' }),
      true
    )

    expect(seeded.settings?.wildeAppearance).toEqual(NEW_WILDE_PROFILE_APPEARANCE)
    expect(seeded.settings?.terminalThemeDark).toBe('Dracula')
    expect(runtime.loadNeedsSave).toBe(true)
  })

  it('also starts a brand-new profile on the Wilde terminal palette', () => {
    const seeded = new LoadedCohortMigrationOperations({ loadNeedsSave: false }).seedWildeAppearance(
      stateWith({ terminalThemeDark: 'Default Dark' }),
      false
    )

    expect(seeded.settings?.wildeAppearance).toEqual(NEW_WILDE_PROFILE_APPEARANCE)
    expect(seeded.settings?.terminalThemeDark).toBe(NEW_WILDE_PROFILE_TERMINAL_THEME_DARK)
  })

  it('never re-seeds a stored choice, including Wilde turned off', () => {
    const runtime = { loadNeedsSave: false }
    const stored = { version: 1, enabled: false }
    const state = stateWith({ wildeAppearance: stored })

    const seeded = new LoadedCohortMigrationOperations(runtime).seedWildeAppearance(state, true)

    expect(seeded).toBe(state)
    expect(runtime.loadNeedsSave).toBe(false)
  })
})
