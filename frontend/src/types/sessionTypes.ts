/**
 * The authenticated user as it is carried in the session cookie.
 *
 * Kept free of server-only imports so both server and client code can use it.
 * Never add anything sensitive here — the payload is signed, not encrypted,
 * so its contents are readable by the browser.
 */
export type SessionUser = {
  id: number
  name: string
  email: string
  image: string
}
