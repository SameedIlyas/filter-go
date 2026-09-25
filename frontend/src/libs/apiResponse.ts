import { NextResponse } from 'next/server'

import { BackendError } from '@/libs/backend'

export const errorResponse = (error: unknown) => {
  if (error instanceof BackendError) {
    const retry = error.details?.retryAfterSeconds

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: error.code, message: error.message, details: error.details, requestId: error.requestId }
      },
      { status: error.status, headers: retry ? { 'retry-after': String(retry) } : undefined }
    )
  }

  console.error('BFF error', error)

  return NextResponse.json(
    { success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 500 }
  )
}
