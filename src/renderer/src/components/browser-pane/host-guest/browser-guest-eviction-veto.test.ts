import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browserPageProtectionReason } from './browser-guest-worktree-retention'
import { hydrateBrowserDrivers } from '../../../lib/pane-manager/browser-mobile-driver-state'
import { hydrateBrowserRemoteViewerPages } from '../../../lib/pane-manager/browser-remote-viewer-state'
import {
  acquireBrowserAutomationVisibility,
  releaseBrowserAutomationVisibility
} from './browser-automation-visibility'
import { installBrowserPageDownloadActivityTracking } from '../navigate/browser-page-download-activity'
import { installBrowserPageAudibleTracking } from '../navigate/browser-page-audible-activity'

// The retention budget DESTROYS a hidden page's guest rather than parking it, so every signal that
// needs the guest alive has to protect the page here — per page, not per worktree.
const WATCHED_PAGE = 'page-watched'

describe('browser guest eviction protection', () => {
  beforeEach(() => {
    hydrateBrowserDrivers([])
    hydrateBrowserRemoteViewerPages([])
  })

  it('leaves a page no signal is holding unprotected', () => {
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBeNull()
  })

  it('protects a page a paired client is streaming, until the last viewer leaves', () => {
    hydrateBrowserRemoteViewerPages([WATCHED_PAGE])
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBe('remote-viewer')
    expect(browserPageProtectionReason('page-sibling')).toBeNull()
    hydrateBrowserRemoteViewerPages([])
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBeNull()
  })

  it('protects a page a phone is driving', () => {
    hydrateBrowserDrivers([
      { browserPageId: WATCHED_PAGE, driver: { kind: 'mobile', clientId: 'conn-phone' } }
    ])
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBe('mobile')
  })

  it('protects a page an agent is driving through an automation lease', () => {
    const token = acquireBrowserAutomationVisibility(WATCHED_PAGE)
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBe('automation')
    releaseBrowserAutomationVisibility(token)
    expect(browserPageProtectionReason(WATCHED_PAGE)).toBeNull()
  })

  // Downloads and audio are not paint terms: parking keeps them alive, eviction ends them
  // (main cancels a page's downloads when its guest unregisters).
  it('protects a page that is still writing a download or playing audio', () => {
    let emitDownloadRequested: (event: { downloadId: string; browserPageId: string }) => void =
      () => {}
    let emitAudible: (event: { browserPageId: string; audible: boolean }) => void = () => {}
    const noop = (): void => {}
    vi.stubGlobal('window', {
      api: {
        browser: {
          onDownloadRequested: (callback: typeof emitDownloadRequested) => {
            emitDownloadRequested = callback
            return noop
          },
          onDownloadProgress: () => noop,
          onDownloadFinished: () => noop,
          onAudibleChanged: (callback: typeof emitAudible) => {
            emitAudible = callback
            return noop
          }
        }
      }
    })
    const onChange = vi.fn()
    const stopDownloadTracking = installBrowserPageDownloadActivityTracking()
    const stopAudibleTracking = installBrowserPageAudibleTracking(onChange)
    try {
      emitAudible({ browserPageId: WATCHED_PAGE, audible: true })
      expect(browserPageProtectionReason(WATCHED_PAGE)).toBe('audible')
      expect(onChange).toHaveBeenCalledTimes(1)
      emitDownloadRequested({ downloadId: 'dl-1', browserPageId: WATCHED_PAGE })
      expect(browserPageProtectionReason(WATCHED_PAGE)).toBe('download')
      stopDownloadTracking()
      emitAudible({ browserPageId: WATCHED_PAGE, audible: false })
      expect(browserPageProtectionReason(WATCHED_PAGE)).toBeNull()
    } finally {
      stopDownloadTracking()
      stopAudibleTracking()
      vi.unstubAllGlobals()
    }
  })
})
