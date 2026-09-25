import { NextResponse } from 'next/server'

import type { LoginData } from '@/types/api'
import { callApi } from '@/libs/backend'
import { errorResponse } from '@/libs/apiResponse'
import { setSessionCookie } from '@/libs/session'

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as { token?: string; password?: string; name?: string }

  try {
    const { data } = await callApi<LoginData>('/v1/auth/accept-invite', {
      method: 'POST',
      body: { token: input.token, password: input.password, ...(input.name ? { name: input.name } : {}) }
    })

    const response = NextResponse.json({ success: true, data: { user: data.user }, error: null })

    // Accepting an invite signs the person in, exactly like a login
    setSessionCookie(response, data.session.token, data.session.expiresAt)

    return response
  } catch (error) {
    return errorResponse(error)
  }
}
