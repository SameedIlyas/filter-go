// Third-party Imports
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

// Type Imports
import type { PageMeta } from '@/types/api'
import type {
  AcceptOfferResponse,
  AddShiftRequest,
  AssignRequest,
  BoardResponse,
  BoardShift,
  CreateOffersResponse,
  ExtraShiftRequest,
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  MyOffersResponse,
  PatchShiftRequest,
  Schedule,
  ScheduleStatus,
  Shift,
  ShiftOffer,
  ShiftStatus,
  ValidateAssignmentResponse
} from '@/types/scheduleTypes'
import type { Site } from '@/types/contractTypes'
import type { User } from '@/types/userTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'
import type { Query } from '../bff'

/*
 * Scheduling (docs/ARCHITECTURE.md 5): the planning board, schedules and their lifecycle, shift assignment with
 * overridable warnings, offers, and the field user's own shifts. Mutations invalidate narrowly: the board windows,
 * the one shift and the one schedule they touched.
 */

const MAX_PAGE = 100

/** Every page of a paged list, fetched in parallel after the first. For small, bounded lists (staff, my shifts). */
const fetchAllPages = async <T>(path: string, key: string, query: Query, signal?: AbortSignal): Promise<T[]> => {
  const first = await bff<Record<string, T[]>>(path, { query: { ...query, page: 1, limit: MAX_PAGE }, signal })
  const totalPages = first.meta?.totalPages ?? 1

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      bff<Record<string, T[]>>(path, { query: { ...query, page: index + 2, limit: MAX_PAGE }, signal })
    )
  )

  return [first, ...rest].flatMap(page => page.data[key] ?? [])
}

// ---- board ------------------------------------------------------------------------

export type BoardParams = {
  from: string
  to: string
  siteIds?: string[]
  userIds?: string[]
  statuses?: ShiftStatus[]
  scheduleId?: string
  includeDraft?: boolean
}

const boardSearch = (params: BoardParams): Query => ({
  from: params.from,
  to: params.to,
  siteIds: params.siteIds?.length ? params.siteIds.join(',') : undefined,
  userIds: params.userIds?.length ? params.userIds.join(',') : undefined,
  statuses: params.statuses?.length ? params.statuses.join(',') : undefined,
  scheduleId: params.scheduleId,
  includeDraft: params.includeDraft === false ? 'false' : undefined
})

export const boardQueryOptions = (params: BoardParams) =>
  queryOptions({
    queryKey: queryKeys.scheduling.board(params),
    queryFn: async ({ signal }) => (await bff<BoardResponse>('shifts/board', { query: boardSearch(params), signal })).data,
    staleTime: 30_000,
    placeholderData: keepPreviousData
  })

/** `GET /shifts/board`: one request per window, rows capped server-side (`truncated`). */
export const useBoardQuery = (params: BoardParams, enabled = true) => useQuery({ ...boardQueryOptions(params), enabled })

/** Warm the neighbouring window so ‹ / › feel instant. */
export const prefetchBoard = (queryClient: QueryClient, params: BoardParams) => queryClient.prefetchQuery(boardQueryOptions(params))

/** People who can be put on a shift: active field users and supervisors the caller can see. */
export const useStaffOptions = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.staff(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const [field, supervisors] = await Promise.all([
        fetchAllPages<User>('users', 'users', { role: 'FIELD_USER', status: 'ACTIVE' }, signal),
        fetchAllPages<User>('users', 'users', { role: 'SUPERVISOR', status: 'ACTIVE' }, signal)
      ])

      return [...field, ...supervisors].sort((a, b) => a.name.localeCompare(b.name))
    }
  })

/** Active sites the caller may schedule (`GET /sites` is scoped per role), for the site filter and site rows. */
export const useSchedulingSites = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.sites(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) =>
      (await fetchAllPages<Site>('sites', 'sites', { active: 'true' }, signal)).sort((a, b) => a.name.localeCompare(b.name))
  })

// ---- schedules --------------------------------------------------------------------

export type ScheduleFilters = {
  status?: ScheduleStatus
  contractId?: string
  siteId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export const useSchedulesQuery = (filters: ScheduleFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.scheduleList(filters),
    enabled,
    queryFn: async ({ signal }): Promise<{ schedules: Schedule[]; meta: PageMeta }> => {
      const { data, meta } = await bff<{ schedules: Schedule[] }>('schedules', { query: filters, signal })

      return { schedules: data.schedules, meta: meta ?? { page: 1, limit: data.schedules.length, total: data.schedules.length, totalPages: 1 } }
    },
    placeholderData: keepPreviousData
  })

export const useScheduleQuery = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.scheduling.schedule(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => (await bff<{ schedule: Schedule }>(`schedules/${id}`, { signal })).data.schedule
  })

/** Refresh everything a schedule change can move: lists, that schedule, and any board window. */
const useScheduleInvalidation = () => {
  const queryClient = useQueryClient()

  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.scheduleLists() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.boards() })

    // Publishing, locking or regenerating changes what every shift in it allows
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.shifts() })
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.schedule(id) })
  }
}

export const useGenerateSchedule = () => {
  const invalidate = useScheduleInvalidation()

  return useMutation({
    mutationFn: async (input: GenerateScheduleRequest) =>
      (await bff<GenerateScheduleResponse>('schedules/generate', { method: 'POST', body: input })).data,
    onSuccess: ({ schedule }) => invalidate(schedule.id)
  })
}

export type ScheduleTransition = 'publish' | 'unpublish' | 'lock' | 'close' | 'regenerate'

export const useScheduleTransition = (id: string) => {
  const invalidate = useScheduleInvalidation()

  return useMutation({
    mutationFn: async (action: ScheduleTransition) =>
      (await bff<{ schedule: Schedule; shiftCount?: number }>(`schedules/${id}/${action}`, { method: 'POST', body: {} })).data,
    onSuccess: () => invalidate(id)
  })
}

export const useDeleteSchedule = () => {
  const invalidate = useScheduleInvalidation()

  return useMutation({
    mutationFn: async (id: string) => bff<{ deleted: true }>(`schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate()
  })
}

// ---- shifts -----------------------------------------------------------------------

export const useShiftQuery = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.scheduling.shift(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => (await bff<{ shift: Shift }>(`shifts/${id}`, { signal })).data.shift
  })

/** After any shift write: the shift itself, its schedule's counts, and the board windows. */
const useShiftInvalidation = () => {
  const queryClient = useQueryClient()

  return (shift?: Pick<Shift, 'id'> & Partial<Pick<Shift, 'scheduleId'>>) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.boards() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.scheduleLists() })

    if (shift) void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.shift(shift.id) })
    if (shift?.scheduleId) void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.schedule(shift.scheduleId) })
  }
}

type BoardPatch = Partial<Pick<BoardShift, 'assignedUser' | 'status'>>

const setShiftInBoards = (queryClient: QueryClient, shiftId: string, patch: BoardPatch) =>
  queryClient.setQueriesData<BoardResponse>({ queryKey: queryKeys.scheduling.boards() }, board =>
    board ? { ...board, shifts: board.shifts.map(shift => (shift.id === shiftId ? { ...shift, ...patch } : shift)) } : board
  )

/**
 * Apply a change to one shift in every cached board window straight away. The undo restores only THAT shift's
 * previous fields, so overlapping moves (two quick drags) never undo each other. The server answer and the
 * refetch after every settle stay the source of truth.
 */
const patchBoards = (queryClient: QueryClient, shiftId: string, patch: BoardPatch) => {
  const before = queryClient
    .getQueriesData<BoardResponse>({ queryKey: queryKeys.scheduling.boards() })
    .flatMap(([, board]) => board?.shifts.filter(shift => shift.id === shiftId) ?? [])[0]

  setShiftInBoards(queryClient, shiftId, patch)

  return () => {
    if (before) setShiftInBoards(queryClient, shiftId, { assignedUser: before.assignedUser, status: before.status })
  }
}

export const useAddShift = (scheduleId: string) => {
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async (input: AddShiftRequest) =>
      (await bff<{ shift: Shift }>(`schedules/${scheduleId}/shifts`, { method: 'POST', body: input })).data.shift,
    onSuccess: shift => invalidate(shift)
  })
}

export const useUpdateShift = (id: string) => {
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async (input: PatchShiftRequest) => (await bff<{ shift: Shift }>(`shifts/${id}`, { method: 'PATCH', body: input })).data.shift,
    onSuccess: shift => invalidate(shift)
  })
}

/** `POST /shifts/:id/validate-assignment`: a dry run, never cached. */
export const useValidateAssignment = () =>
  useMutation({
    mutationFn: async ({ shiftId, userId }: { shiftId: string; userId: string }) =>
      (await bff<ValidateAssignmentResponse>(`shifts/${shiftId}/validate-assignment`, { method: 'POST', body: { userId } })).data
  })

export type AssignVariables = AssignRequest & { shiftId: string; userName: string }

/** Moves the card on the board at once; rolls back if the server refuses (warnings, overlap, ...). */
export const useAssignShift = () => {
  const queryClient = useQueryClient()
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async ({ shiftId, userId, overrideWarnings, reason }: AssignVariables) =>
      (await bff<{ shift: Shift }>(`shifts/${shiftId}/assign`, { method: 'POST', body: { userId, overrideWarnings, reason } })).data.shift,
    onMutate: async ({ shiftId, userId, userName }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.scheduling.boards() })

      return { undo: patchBoards(queryClient, shiftId, { assignedUser: { id: userId, name: userName }, status: 'ASSIGNED' }) }
    },
    onError: (_error, _variables, context) => context?.undo(),

    // Success or failure, refetch: the server's answer replaces any optimistic state
    onSettled: (shift, _error, { shiftId }) => invalidate(shift ?? { id: shiftId })
  })
}

export const useUnassignShift = () => {
  const queryClient = useQueryClient()
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async (shiftId: string) => (await bff<{ shift: Shift }>(`shifts/${shiftId}/unassign`, { method: 'POST', body: {} })).data.shift,
    onMutate: async shiftId => {
      await queryClient.cancelQueries({ queryKey: queryKeys.scheduling.boards() })

      return { undo: patchBoards(queryClient, shiftId, { assignedUser: null, status: 'OPEN' }) }
    },
    onError: (_error, _shiftId, context) => context?.undo(),
    onSettled: (shift, _error, shiftId) => invalidate(shift ?? { id: shiftId })
  })
}

export const useCancelShift = () => {
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async ({ shiftId, reason }: { shiftId: string; reason: string }) =>
      (await bff<{ shift: Shift }>(`shifts/${shiftId}/cancel`, { method: 'POST', body: { reason } })).data.shift,
    onSuccess: shift => invalidate(shift)
  })
}

export const useOfferShift = () => {
  const invalidate = useShiftInvalidation()

  return useMutation({
    mutationFn: async ({ shiftId, userIds }: { shiftId: string; scheduleId: string; userIds: string[] }) =>
      (await bff<CreateOffersResponse>(`shifts/${shiftId}/offers`, { method: 'POST', body: { userIds } })).data.offers,
    onSuccess: (_offers, { shiftId, scheduleId }) => invalidate({ id: shiftId, scheduleId })
  })
}

// ---- field user -------------------------------------------------------------------

/** `GET /me/shifts` for a visible calendar range; small by nature, so every page is fetched. */
export const useMyShifts = (range: { from: string; to: string }, enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.myShifts(range),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchAllPages<Shift>('me/shifts', 'shifts', range, signal)
  })

export const useMyOffers = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.myOffers(),
    enabled,
    refetchInterval: 60_000,
    queryFn: ({ signal }) => fetchAllPages<MyOffersResponse['offers'][number]>('me/offers', 'offers', {}, signal)
  })

/** Published schedules at the field user's sites: the choices for "Log extra shift". */
export const useMyPublishedSchedules = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.scheduling.mySchedules(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => fetchAllPages<Schedule>('schedules', 'schedules', { status: 'PUBLISHED' }, signal)
  })

const useMeInvalidation = () => {
  const queryClient = useQueryClient()

  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.me() })
}

export const useConfirmShift = () => {
  const invalidate = useMeInvalidation()

  return useMutation({
    mutationFn: async (shiftId: string) => (await bff<{ shift: Shift }>(`shifts/${shiftId}/confirm`, { method: 'POST', body: {} })).data.shift,
    onSuccess: () => invalidate()
  })
}

export const useAnswerOffer = () => {
  const invalidate = useMeInvalidation()

  return useMutation({
    mutationFn: async ({ offerId, answer }: { offerId: string; answer: 'accept' | 'decline' }) =>
      (await bff<AcceptOfferResponse | { offer: ShiftOffer }>(`shift-offers/${offerId}/${answer}`, { method: 'POST', body: {} })).data,
    onSettled: () => invalidate()
  })
}

export const useLogExtraShift = () => {
  const invalidate = useMeInvalidation()

  return useMutation({
    mutationFn: async (input: ExtraShiftRequest) => (await bff<{ shift: Shift }>('shifts/extra', { method: 'POST', body: input })).data.shift,
    onSuccess: () => invalidate()
  })
}
