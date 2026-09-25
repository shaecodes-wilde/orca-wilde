/**
 * Orca Wilde's release update feed. The fork publishes no release builds, so this is
 * null and updater-setup.ts keeps every electron-updater entry point inert.
 *
 * Why a module of its own: the upstream updater suites exercise the real feed machinery
 * against stock Orca's feed, so config/scripts/vitest-wilde-fork-updater-setup.ts mocks
 * this to that URL. updater.fork-disabled.test.ts covers the shipped null behavior.
 */
export function getForkUpdateFeedUrl(): string | null {
  return null
}
