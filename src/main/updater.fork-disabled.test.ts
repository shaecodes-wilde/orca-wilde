import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  autoUpdaterMock,
  powerMonitorOnMock,
  fetchNudgeMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('@electron-toolkit/utils', () => moduleFactories.electronToolkitUtils())
vi.mock('./ipc/pty', () => moduleFactories.ipcPty())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())
// Why: overrides the suite-wide stock feed from vitest-wilde-fork-updater-setup.ts so this file
// runs against the fork's shipped (null) feed.
vi.mock('./updater/fork-update-feed', () => ({ getForkUpdateFeedUrl: () => null }))

warmUpdaterModule()

describe('updater with the fork feed disabled', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
  })

  it('never wires electron-updater, nudges or wake checks in a packaged build', async () => {
    const mainWindow = { webContents: { send: vi.fn() } }

    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(mainWindow as never, {
      getLastUpdateCheckAt: () => Date.now() - 25 * 60 * 60 * 1000
    })
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000)

    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.on).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(fetchNudgeMock).not.toHaveBeenCalled()
    expect(powerMonitorOnMock).not.toHaveBeenCalled()
  })

  it('answers a manual check with not-available instead of reaching any feed', async () => {
    const send = vi.fn()
    const mainWindow = { webContents: { send } }

    const { setupAutoUpdater, checkForUpdatesFromMenu, downloadUpdate } =
      await loadUpdaterModule()

    setupAutoUpdater(mainWindow as never)
    checkForUpdatesFromMenu()
    downloadUpdate()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      'updater:status',
      expect.objectContaining({ state: 'not-available', userInitiated: true })
    )
  })
})
