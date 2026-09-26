import { describe, expect, it } from 'vitest'
import {
  selectBrowserGuestEvictionPages,
  touchBrowserGuestRecency,
  type BrowserGuestRetentionCandidate
} from './browser-guest-worktree-retention'

// Six live pages across two hidden worktrees plus two in the active one.
const CANDIDATES: BrowserGuestRetentionCandidate[] = [
  { pageId: 'a1', worktreeId: 'wt-a', live: true },
  { pageId: 'a2', worktreeId: 'wt-a', live: true },
  { pageId: 'a3', worktreeId: 'wt-a', live: true },
  { pageId: 'b1', worktreeId: 'wt-b', live: true },
  { pageId: 'b2', worktreeId: 'wt-b', live: true },
  { pageId: 'b3', worktreeId: 'wt-b', live: true },
  { pageId: 'act1', worktreeId: 'wt-active', live: true },
  { pageId: 'act2', worktreeId: 'wt-active', live: true }
]

function select(
  overrides: Partial<Parameters<typeof selectBrowserGuestEvictionPages>[0]> = {}
): ReturnType<typeof selectBrowserGuestEvictionPages> {
  return selectBrowserGuestEvictionPages({
    candidates: CANDIDATES,
    recency: ['act1', 'act2', 'b1', 'b2', 'b3', 'a1', 'a2', 'a3'],
    activeWorktreeId: 'wt-active',
    isRetained: () => true,
    protectionReason: () => null,
    limit: 4,
    ...overrides
  })
}

describe('selectBrowserGuestEvictionPages', () => {
  it('evicts hidden pages beyond the budget in LRU order, sparing active-worktree pages', () => {
    const { entries, evictedPageIds } = select()
    expect(evictedPageIds).toEqual(['a2', 'a3'])
    const reasons = Object.fromEntries(entries.map((entry) => [entry.pageId, entry.reason]))
    expect(reasons).toMatchObject({ act1: 'visible', act2: 'visible', b1: 'warm', a1: 'warm' })
    expect(entries.find((entry) => entry.pageId === 'a3')).toMatchObject({
      live: false,
      reason: null
    })
  })

  it('is a no-op within budget', () => {
    expect(select({ limit: 6 }).evictedPageIds).toEqual([])
  })

  it('protects pages individually without shielding siblings or taking a warm slot', () => {
    const { entries, evictedPageIds } = select({
      protectionReason: (pageId) => (pageId === 'a3' || pageId === 'b1' ? 'audible' : null)
    })
    // b1 is protected, so b2, b3, a1, a2 fill the four warm slots; a3 is protected.
    expect(evictedPageIds).toEqual([])
    expect(select({ limit: 2, protectionReason: (id) => (id === 'a3' ? 'download' : null) }))
      .toMatchObject({ evictedPageIds: ['b3', 'a1', 'a2'] })
    expect(entries.find((entry) => entry.pageId === 'a3')?.reason).toBe('audible')
  })

  it('ranks untouched pages last and skips dead pages and unmounted worktrees', () => {
    const { evictedPageIds, entries } = select({
      recency: ['a1'],
      limit: 1,
      isRetained: (worktreeId) => worktreeId !== 'wt-b',
      candidates: CANDIDATES.map((c) => (c.pageId === 'a2' ? { ...c, live: false } : c))
    })
    expect(evictedPageIds).toEqual(['a3'])
    expect(entries.find((entry) => entry.pageId === 'b1')).toMatchObject({ live: true, reason: null })
  })
})

describe('touchBrowserGuestRecency', () => {
  it('moves a touched page to the front without duplicating it', () => {
    const recency = ['p2', 'p1']
    touchBrowserGuestRecency(recency, 'p1')
    expect(recency).toEqual(['p1', 'p2'])
    touchBrowserGuestRecency(recency, 'p3')
    expect(recency).toEqual(['p3', 'p1', 'p2'])
  })
})
