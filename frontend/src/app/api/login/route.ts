// Next Imports
import { NextResponse } from 'next/server'

// Lib Imports
import { createSessionCookie } from '@/libs/session'

// Type Imports
import type { UserTable } from './users'

// Mock data for demo purpose
import { users } from './users'

type ResponseUser = Omit<UserTable, 'password'>

/*
 * Signs a user in and sets the session cookie.
 *
 * This is the single seam between the portal and whatever authenticates
 * CoolCraft staff for real. To swap in the live API, replace the `users.find`
 * lookup below with a call to it and keep the rest of the handler as-is.
 */
export async function POST(req: Request) {
  // Vars
  const { email, password } = await req.json()
  const user = users.find(u => u.email === email && u.password === password)

  if (!user) {
    // We return 401 status code and error message if user is not found
    return NextResponse.json(
      {
        // We create object here to separate each error message for each field in case of multiple errors
        message: ['Email or Password is invalid']
      },
      {
        status: 401,
        statusText: 'Unauthorized Access'
      }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...filteredUserData } = user

  const response = NextResponse.json<ResponseUser>({ ...filteredUserData })

  response.cookies.set(createSessionCookie(filteredUserData))

  return response
}
