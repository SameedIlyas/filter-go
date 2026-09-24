// Third-party Imports
import { useMutation } from '@tanstack/react-query'

import type { UseMutationResult } from '@tanstack/react-query'

// Lib Imports
import { apiFetch } from '../api-client'

export type AppointmentPayload = {
  firstName: string
  lastName?: string
  email: string
  company?: string
  region?: string
  phone?: string
  serviceAddress?: string
  preferredDate?: string
  preferredTime: string
  businessType: string
  notes?: string
  privacy: true
}

export type AppointmentResponse = {
  message: string
}

/**
 * `POST /contact` — the public appointment request.
 *
 * Nothing is invalidated on success: the submission does not feed any query in
 * the cache, so there is no stale data to refresh.
 */
export const useAppointmentMutation = (): UseMutationResult<AppointmentResponse, Error, AppointmentPayload> =>
  useMutation({
    mutationFn: payload => apiFetch<AppointmentResponse>('/contact', { method: 'POST', body: payload })
  })
