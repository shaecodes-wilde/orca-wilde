import { describe, expect, it } from 'vitest'
import {
  combineAttention,
  deriveWorktreeAttention,
  type WorktreeAttentionInput
} from './group-attention'
import { getGroupAttentionCardSpans } from './GroupAttentionCards'
import type { RenderRow } from '../listing/render-row'

const base: WorktreeAttentionInput = {
  status: 'inactive',
  isUnread: false,
  latestDoneAt: 0,
  latestInterruptedAt: 0,
  viewedAt: 100
}

describe('deriveWorktreeAttention', () => {
  it('is lavender for permission prompts and unread output', () => {
    expect(deriveWorktreeAttention({ ...base, status: 'permission' })).toBe('lavender')
    expect(deriveWorktreeAttention({ ...base, isUnread: true })).toBe('lavender')
  })

  it('is lavender for an error only until viewed', () => {
    expect(
      deriveWorktreeAttention({ ...base, status: 'interrupted', latestInterruptedAt: 200 })
    ).toBe('lavender')
    expect(
      deriveWorktreeAttention({ ...base, status: 'interrupted', latestInterruptedAt: 50 })
    ).toBeNull()
  })

  it('is mint for a finish newer than the last view', () => {
    expect(deriveWorktreeAttention({ ...base, status: 'done', latestDoneAt: 200 })).toBe('mint')
    expect(deriveWorktreeAttention({ ...base, status: 'done', latestDoneAt: 100 })).toBeNull()
  })

  it('prefers lavender over mint and ignores done while working', () => {
    expect(
      deriveWorktreeAttention({ ...base, status: 'done', latestDoneAt: 200, isUnread: true })
    ).toBe('lavender')
    expect(deriveWorktreeAttention({ ...base, status: 'working', latestDoneAt: 200 })).toBeNull()
  })
})

describe('combineAttention', () => {
  it('ranks lavender > mint > nothing', () => {
    expect(combineAttention([])).toBeNull()
    expect(combineAttention([null, 'mint'])).toBe('mint')
    expect(combineAttention(['mint', 'lavender', null])).toBe('lavender')
  })
})

describe('getGroupAttentionCardSpans', () => {
  const header = (key: string, extra: Partial<Extract<RenderRow, { type: 'header' }>> = {}) =>
    ({ type: 'header', key, label: key, count: 0, tone: '', ...extra }) as RenderRow
  const item = (id: string) => ({ type: 'item', rowKey: id }) as unknown as RenderRow
  const m = (start: number, end: number) => ({ start, end })

  it('spans a header through its rows and stops at the next header', () => {
    const rows = [header('a'), item('1'), item('2'), header('b'), item('3')]
    const measurements = [m(0, 28), m(28, 80), m(80, 130), m(130, 158), m(158, 200)]
    const spans = getGroupAttentionCardSpans(rows, measurements, {
      'hdr:a': 'lavender',
      'hdr:b': 'mint'
    })
    expect(spans).toEqual([
      { key: 'hdr:a', attention: 'lavender', top: 1, height: 132 },
      { key: 'hdr:b', attention: 'mint', top: 131, height: 72 }
    ])
  })

  it('wraps just the header of a collapsed group and skips project folders', () => {
    const rows = [
      header('folder', { projectGroup: { id: null, name: 'Ungrouped', tabOrder: 0 } }),
      header('a')
    ]
    const spans = getGroupAttentionCardSpans(rows, [m(0, 28), m(28, 56)], {
      'hdr:folder': 'mint',
      'hdr:a': 'mint'
    })
    expect(spans).toEqual([{ key: 'hdr:a', attention: 'mint', top: 29, height: 30 }])
  })
})
