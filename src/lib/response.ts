import type { AppError } from './errors.js'

export interface PageMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface SuccessBody<T> {
  success: true
  data: T
  meta?: PageMeta
  error: null
}

export interface ErrorBody {
  success: false
  data: null
  error: {
    code: AppError['code']
    message: string
    details?: AppError['details']
    requestId: string
  }
}

export const ok = <T>(data: T, meta?: PageMeta): SuccessBody<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
  error: null
})

export const fail = (
  code: ErrorBody['error']['code'],
  message: string,
  requestId: string,
  details?: AppError['details']
): ErrorBody => ({
  success: false,
  data: null,
  error: { code, message, ...(details ? { details } : {}), requestId }
})
