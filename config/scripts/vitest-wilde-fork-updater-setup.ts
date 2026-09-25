import { vi } from 'vitest'

// Why: the fork ships with its update feed disabled (src/main/updater/fork-update-feed.ts),
// which turns every upstream updater suite into a no-op. Restoring stock Orca's feed here keeps
// those suites testing the machinery a future fork feed would re-enable, and keeps upstream
// merges of updater tests conflict-free.
vi.mock('../../src/main/updater/fork-update-feed', () => ({
  getForkUpdateFeedUrl: () => 'https://github.com/stablyai/orca/releases/latest/download'
}))
