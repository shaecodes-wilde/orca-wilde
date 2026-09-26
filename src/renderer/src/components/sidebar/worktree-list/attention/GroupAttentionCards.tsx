import React from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { getRenderRowKey, type RenderRow } from '../listing/render-row'
import type { SidebarAttention } from './group-attention'
import { isAttentionGroupHeader } from './use-sidebar-attention'

// Why: the card grows past the header's top edge and the last row's bottom edge a
// little so the rounded corners clear the content instead of clipping it.
const CARD_TOP_OFFSET_PX = 1
const CARD_BOTTOM_OVERHANG_PX = 3

type CardSpan = { key: string; attention: SidebarAttention; top: number; height: number }

export function getGroupAttentionCardSpans(
  renderRows: readonly RenderRow[],
  measurements: readonly Pick<VirtualItem, 'start' | 'end'>[],
  attentionByHeaderKey: Readonly<Record<string, SidebarAttention>>
): CardSpan[] {
  const spans: CardSpan[] = []
  for (let index = 0; index < renderRows.length; index += 1) {
    const row = renderRows[index]
    if (!row || !isAttentionGroupHeader(row)) {
      continue
    }
    const key = getRenderRowKey(row)
    const attention = attentionByHeaderKey[key]
    const headerMeasurement = measurements[index]
    if (!attention || !headerMeasurement) {
      continue
    }
    // A group runs until the next header of any kind (project folder, host, or section).
    let lastIndex = index
    while (lastIndex + 1 < renderRows.length) {
      const next = renderRows[lastIndex + 1]
      if (!next || next.type === 'header' || next.type === 'host-header') {
        break
      }
      lastIndex += 1
    }
    const lastMeasurement = measurements[lastIndex] ?? headerMeasurement
    const top = headerMeasurement.start + CARD_TOP_OFFSET_PX
    spans.push({
      key,
      attention,
      top,
      height: Math.max(0, lastMeasurement.end + CARD_BOTTOM_OVERHANG_PX - top)
    })
  }
  return spans
}

/** Lavender / mint cards painted behind whole sidebar groups; rows render above them. */
export function GroupAttentionCards({
  renderRows,
  measurements,
  attentionByHeaderKey,
  hidden
}: {
  renderRows: readonly RenderRow[]
  measurements: readonly Pick<VirtualItem, 'start' | 'end'>[]
  attentionByHeaderKey: Readonly<Record<string, SidebarAttention>>
  hidden: boolean
}): React.JSX.Element | null {
  if (hidden || Object.keys(attentionByHeaderKey).length === 0) {
    return null
  }
  return (
    <>
      {getGroupAttentionCardSpans(renderRows, measurements, attentionByHeaderKey).map((span) => (
        <div
          key={span.key}
          aria-hidden
          data-wilde-group-attention={span.attention}
          className="pointer-events-none absolute left-0 right-1 top-0"
          style={{ transform: `translateY(${span.top}px)`, height: `${span.height}px` }}
        />
      ))}
    </>
  )
}
