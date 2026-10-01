// Third-party Imports
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Type Imports
import type { PageMeta } from '@/types/api'
import type {
  AdjustInput,
  ApproveBatchResponse,
  ClockInInput,
  ClockOutInput,
  CorrectInput,
  ExceptionQueueResponse,
  ExceptionType,
  HoursResponse,
  Timesheet,
  TimesheetDetail,
  TimesheetException,
  TimesheetListQuery,
  TimesheetStatus,
  WorkLog,
  WorkLogInput
} from '@/types/timesheetTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'
import type { Query } from '../bff'

/*
 * Timesheets (docs/ARCHITECTURE.md 6): the supervisor's review (list, exception queue, hours grid, approve, reject,
 * adjust), the worker's clocking and corrections, and work logs. Every write can move an entry between the review
 * lists, the queue and the grid, so writes refresh the whole timesheets family; clocking also moves the shift, so it
 * refreshes the scheduling caches too.
 */

const emptyMeta = (count: number): PageMeta => ({ page: 1, limit: count, total: count, totalPages: 1 })

type Paged<T> = { items: T[]; meta: PageMeta }

/** A query object without undefined/empty values, so equal filters share one cache key. */
const clean = (query: object): Query =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => [key, typeof value === 'boolean' ? String(value) : value])
  ) as Query

const useTimesheetInvalidation = () => {
  const queryClient = useQueryClient()

  return ({ schedule = false }: { schedule?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.timesheets.all() })

    // Clocking and approving move the shift's status (IN_PROGRESS, COMPLETED, NO_SHOW revived): board and my shifts
    if (schedule) void queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.all() })
  }
}

// ---- reads (staff) -------------------------------------------------------------------

export type TimesheetFilters = Omit<TimesheetListQuery, 'page' | 'limit'> & { page?: number; limit?: number }

/** `GET /timesheets` (staff scope), newest shift first. */
export const useTimesheetsQuery = (filters: TimesheetFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.timesheets.list(clean(filters)),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<Paged<Timesheet>> => {
      const { data, meta } = await bff<{ timesheets: Timesheet[] }>('timesheets', { query: clean(filters), signal })

      return { items: data.timesheets, meta: meta ?? emptyMeta(data.timesheets.length) }
    }
  })

export type ExceptionFilters = { type?: ExceptionType; siteId?: string; userId?: string; page?: number; limit?: number }

/** `GET /timesheets/exceptions`: unresolved exceptions, oldest first. */
export const useExceptionQueue = (filters: ExceptionFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.timesheets.exceptions(clean(filters)),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: async ({ signal }): Promise<Paged<ExceptionQueueResponse['exceptions'][number]>> => {
      const { data, meta } = await bff<ExceptionQueueResponse>('timesheets/exceptions', { query: clean(filters), signal })

      return { items: data.exceptions, meta: meta ?? emptyMeta(data.exceptions.length) }
    }
  })

export type HoursParams = { from: string; to: string; siteId?: string; userId?: string }

/** `GET /timesheets/hours`: the per-worker, per-day grid (calendar dates, at most 45 days). */
export const useHoursQuery = (params: HoursParams, enabled = true) =>
  useQuery({
    queryKey: queryKeys.timesheets.hours(clean(params)),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async ({ signal }) => (await bff<HoursResponse>('timesheets/hours', { query: clean(params), signal })).data
  })

export const useTimesheetQuery = (id: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.timesheets.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => (await bff<{ timesheet: TimesheetDetail }>(`timesheets/${id}`, { signal })).data.timesheet
  })

// ---- review (staff) ------------------------------------------------------------------

export const useApproveTimesheet = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async (id: string) => (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/approve`, { method: 'POST', body: {} })).data.timesheet,
    onSuccess: () => invalidate({ schedule: true })
  })
}

/** `POST /timesheets/approve-batch`: approves the clean SUBMITTED ones, reports why it skipped the rest. */
export const useApproveBatch = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async (ids: string[]) => (await bff<ApproveBatchResponse>('timesheets/approve-batch', { method: 'POST', body: { ids } })).data,
    onSettled: () => invalidate({ schedule: true })
  })
}

export const useRejectTimesheet = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/reject`, { method: 'POST', body: { reason } })).data.timesheet,
    onSuccess: () => invalidate()
  })
}

export const useAdjustTimesheet = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AdjustInput }) =>
      (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/adjust`, { method: 'POST', body: input })).data.timesheet,
    onSuccess: () => invalidate({ schedule: true })
  })
}

export const useResolveException = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) =>
      (await bff<{ exception: TimesheetException }>(`timesheet-exceptions/${id}/resolve`, { method: 'POST', body: note ? { note } : {} })).data.exception,
    onSuccess: () => invalidate()
  })
}

// ---- the worker ----------------------------------------------------------------------

export type MyTimesheetFilters = { status?: TimesheetStatus; from?: string; to?: string; page?: number; limit?: number }

/** `GET /me/timesheets`: my own entries, newest shift first, never any rate. */
export const useMyTimesheets = (filters: MyTimesheetFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.timesheets.mine(clean(filters)),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<Paged<Timesheet>> => {
      const { data, meta } = await bff<{ timesheets: Timesheet[] }>('me/timesheets', { query: clean(filters), signal })

      return { items: data.timesheets, meta: meta ?? emptyMeta(data.timesheets.length) }
    }
  })

/** The entry I am clocked in on, if any (one at a time in practice; the newest wins). */
export const useMyOpenTimesheet = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.timesheets.myOpen(),
    enabled,
    refetchInterval: 60_000,
    queryFn: async ({ signal }) =>
      (await bff<{ timesheets: Timesheet[] }>('me/timesheets', { query: { status: 'OPEN', limit: 1 }, signal })).data.timesheets[0] ?? null
  })

export const useClockIn = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ shiftId, gps }: { shiftId: string; gps: ClockInInput }) =>
      (await bff<{ timesheet: Timesheet }>(`shifts/${shiftId}/clock-in`, { method: 'POST', body: gps })).data.timesheet,
    onSuccess: () => invalidate({ schedule: true })
  })
}

export const useClockOut = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ClockOutInput }) =>
      (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/clock-out`, { method: 'POST', body: input })).data.timesheet,
    onSuccess: () => invalidate({ schedule: true })
  })
}

export const useCorrectTimesheet = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CorrectInput }) =>
      (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/correct`, { method: 'PATCH', body: input })).data.timesheet,
    onSuccess: () => invalidate()
  })
}

export const useResubmitTimesheet = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async (id: string) => (await bff<{ timesheet: Timesheet }>(`timesheets/${id}/resubmit`, { method: 'POST', body: {} })).data.timesheet,
    onSuccess: () => invalidate()
  })
}

// ---- work logs -----------------------------------------------------------------------

const MAX_WORK_LOGS = 100

/** `GET /shifts/:id/work-logs`, the first 100 (a shift rarely has more). */
export const useWorkLogs = (shiftId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.timesheets.workLogs(shiftId ?? ''),
    enabled: Boolean(shiftId),
    queryFn: async ({ signal }) => (await bff<{ workLogs: WorkLog[] }>(`shifts/${shiftId}/work-logs`, { query: { limit: MAX_WORK_LOGS }, signal })).data.workLogs
  })

export const useAddWorkLog = () => {
  const invalidate = useTimesheetInvalidation()

  return useMutation({
    mutationFn: async ({ shiftId, input }: { shiftId: string; input: WorkLogInput }) =>
      (await bff<{ workLog: WorkLog }>(`shifts/${shiftId}/work-logs`, { method: 'POST', body: input })).data.workLog,
    onSuccess: () => invalidate()
  })
}
