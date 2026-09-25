import { randomUUID } from 'node:crypto'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  NEW_WILDE_PROFILE_APPEARANCE,
  NEW_WILDE_PROFILE_TERMINAL_THEME_DARK
} from '../../../shared/wilde-appearance'

import type { StoreRuntimeState } from './store-runtime-state'

type LoadedCohortMigrationOperationsRuntime = Pick<StoreRuntimeState, 'loadNeedsSave'>

export class LoadedCohortMigrationOperations {
  constructor(private readonly runtime: LoadedCohortMigrationOperationsRuntime) {}

  /**
   * The Wilde-themed build installs over stock Orca and shares its profile, so Wilde turns on the
   * first time this build loads a profile without a stored choice — existing profiles included.
   * Once `wildeAppearance` is stored (including "off"), it is the user's setting and never re-seeded.
   */
  seedWildeAppearance(state: PersistedState, fileExistedOnLoad: boolean): PersistedState {
    if (state.settings?.wildeAppearance !== undefined) {
      return state
    }
    // Why: mark dirty so the seed persists; else a fresh install re-reads as "existing" once its file lands.
    this.runtime.loadNeedsSave = true
    return {
      ...state,
      settings: {
        ...state.settings,
        wildeAppearance: NEW_WILDE_PROFILE_APPEARANCE,
        // Why fresh profiles only: an existing profile's terminal theme is the user's choice; a
        // brand-new one still holds the stock default.
        ...(fileExistedOnLoad ? {} : { terminalThemeDark: NEW_WILDE_PROFILE_TERMINAL_THEME_DARK })
      }
    }
  }

  migrateTabSwitchKeybindings(state: PersistedState, fileExistedOnLoad: boolean): PersistedState {
    const existing = state.settings?.tabSwitchKeybindingSeed
    if (existing === 'pending' || existing === 'done') {
      return state
    }
    // Why: mark dirty so the frozen cohort persists; else a fresh install re-reads as "existing" after its file lands.
    this.runtime.loadNeedsSave = true
    return {
      ...state,
      settings: {
        ...state.settings,
        // Existing installs pin old chords via a keybindings.json seed; fresh installs use the new registry defaults.
        tabSwitchKeybindingSeed: fileExistedOnLoad ? 'pending' : 'done'
      }
    }
  }

  migrateTelemetry(state: PersistedState, fileExistedOnLoad: boolean): PersistedState {
    const existing = state.settings?.telemetry
    // Why: require all three invariants; keying on existedBeforeTelemetryRelease alone lets a partial block skip migration.
    if (
      typeof existing?.existedBeforeTelemetryRelease === 'boolean' &&
      typeof existing.installId === 'string' &&
      existing.installId.length > 0 &&
      (existing.optedIn === true || existing.optedIn === false || existing.optedIn === null)
    ) {
      return state
    }
    // Why: resolve cohort once; re-inferring it in the optedIn fallback could misclassify a partially-written new user.
    const resolvedExistedBefore =
      typeof existing?.existedBeforeTelemetryRelease === 'boolean'
        ? existing.existedBeforeTelemetryRelease
        : fileExistedOnLoad
    return {
      ...state,
      settings: {
        ...state.settings,
        telemetry: {
          ...existing,
          existedBeforeTelemetryRelease: resolvedExistedBefore,
          // Why: preserve any explicit opt-in/out; fall back to cohort default only when optedIn is undefined, never when false.
          optedIn:
            existing?.optedIn === true || existing?.optedIn === false || existing?.optedIn === null
              ? existing.optedIn
              : resolvedExistedBefore
                ? null
                : true,
          installId:
            typeof existing?.installId === 'string' && existing.installId.length > 0
              ? existing.installId
              : randomUUID()
        }
      }
    }
  }
}
