import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeViewedAt, wildeAttentionViewedStore } from '@/lib/wilde-attention-viewed'
import type { WorktreeGroupBy } from '../grouping/row-types'
import { getRenderRowKey, type RenderRow } from '../listing/render-row'
import { combineAttention, type SidebarAttention } from './group-attention'
import { selectWorktreeAttention } from './worktree-attention-selector'

type GroupHeaderRenderRow = Extract<RenderRow, { type: 'header' }>

/** Headers that get a card: section groups (project / status / PR / pinned), never user project folders. */
export function isAttentionGroupHeader(row: RenderRow): row is GroupHeaderRenderRow {
  return row.type === 'header' && !row.projectGroup
}

function headerWorktreeIds(row: GroupHeaderRenderRow): readonly string[] {
  if (row.hostId) {
    return row.hostWorktreeIds?.get(row.hostId) ?? row.worktreeIds ?? []
  }
  return row.worktreeIds ?? []
}

/** Group card color per header render key. Empty in 'none' mode, where cards tint individually. */
export function useGroupAttentionByHeaderKey(
  renderRows: readonly RenderRow[],
  worktreeMap: ReadonlyMap<string, Worktree>,
  groupBy: WorktreeGroupBy
): Readonly<Record<string, SidebarAttention>> {
  const viewed = useStore(wildeAttentionViewedStore)
  return useAppStore(
    useShallow((state) => {
      const out: Record<string, SidebarAttention> = {}
      if (groupBy === 'none') {
        return out
      }
      for (const row of renderRows) {
        if (!isAttentionGroupHeader(row)) {
          continue
        }
        const attention = combineAttention(
          headerWorktreeIds(row).map((worktreeId) =>
            selectWorktreeAttention(
              state,
              worktreeId,
              worktreeMap.get(worktreeId)?.isUnread === true,
              getWorktreeViewedAt(viewed, worktreeId)
            )
          )
        )
        if (attention) {
          out[getRenderRowKey(row)] = attention
        }
      }
      return out
    })
  )
}

/** Per-card fallback for the flat ('none') sidebar, which has no group headers to wrap. */
export function useWorktreeCardAttention(worktree: Worktree): SidebarAttention | null {
  const viewedAt = useStore(wildeAttentionViewedStore, (viewed) =>
    getWorktreeViewedAt(viewed, worktree.id)
  )
  return useAppStore((state) =>
    state.groupBy === 'none'
      ? selectWorktreeAttention(state, worktree.id, worktree.isUnread === true, viewedAt)
      : null
  )
}
