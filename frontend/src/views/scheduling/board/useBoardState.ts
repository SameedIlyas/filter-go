'use client'

// React Imports
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { BOARD_DEFAULTS, parseBoardState, serializeBoardState } from '../logic/boardWindow'
import type { BoardState } from '../logic/boardWindow'
import { todayKey } from '../logic/zoned'

export type BoardStateApi = {
  state: BoardState
  update: (patch: Partial<BoardState>) => void

  /** The shift whose drawer is open. */
  selectedShiftId: string | null
  selectShift: (id: string | null) => void
}

/**
 * Board state. On /schedules it lives in the URL (shareable, survives refresh, `?shift=` opens a drawer from a
 * link); embedded in a schedule's page it is local, so it never fights that page's own URL.
 */
export const useBoardState = (embedded: boolean, initialDate?: string): BoardStateApi => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const today = todayKey()

  const [local, setLocal] = useState<BoardState>(() => ({ ...BOARD_DEFAULTS, anchor: initialDate ?? today }))
  const [localShift, setLocalShift] = useState<string | null>(null)

  const fromUrl = useMemo(() => parseBoardState(new URLSearchParams(searchParams.toString()), today), [searchParams, today])

  const urlShift = searchParams.get('shift')

  /*
   * The latest state we asked for. `router.replace` commits asynchronously, so two quick changes (a double click on
   * ›, a filter then a range) must build on each other, not both on the last committed URL.
   */
  const pending = useRef<{ state: BoardState; shift: string | null; search: string | null }>({ state: fromUrl, shift: urlShift, search: null })

  // The URL changed without us (back/forward, a pasted link): take it as the new truth
  useEffect(() => {
    if (searchParams.toString() !== pending.current.search) pending.current = { state: fromUrl, shift: urlShift, search: null }
  }, [searchParams, fromUrl, urlShift])

  const replaceUrl = useCallback(
    (state: BoardState, shift: string | null) => {
      const params = serializeBoardState(state, today)

      if (shift) params.set('shift', shift)

      const search = params.toString()

      pending.current = { state, shift, search }
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
    },
    [pathname, router, today]
  )

  const update = useCallback(
    (patch: Partial<BoardState>) => {
      if (embedded) setLocal(current => ({ ...current, ...patch }))
      else replaceUrl({ ...pending.current.state, ...patch }, pending.current.shift)
    },
    [embedded, replaceUrl]
  )

  const selectShift = useCallback(
    (id: string | null) => {
      if (embedded) setLocalShift(id)
      else replaceUrl(pending.current.state, id)
    },
    [embedded, replaceUrl]
  )

  return embedded
    ? { state: local, update, selectedShiftId: localShift, selectShift }
    : { state: fromUrl, update, selectedShiftId: urlShift, selectShift }
}
