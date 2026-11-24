import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

const COOKIE_NAME = 'mockci_session'
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/'
})

function secret(): string {
  const value = process.env.SESSION_SECRET

  if (!value) {
    throw new Error('SESSION_SECRET is not set. Put any long random text in it in .env.local and restart the app.')
  }

  return value
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

// Cookie value is "<userId>.<expiresMs>.<signature>".
function readValue(value: string | undefined): string | null {
  const parts = value?.split('.') ?? []

  if (parts.length !== 3) return null

  const [userId, expires, signature] = parts
  const expected = Buffer.from(sign(`${userId}.${expires}`))
  const given = Buffer.from(signature)

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  return Number(expires) > Date.now() ? userId : null
}

/** Only works where cookies can be written: route handlers and server actions. */
export async function setSession(userId: string): Promise<void> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000
  const value = `${userId}.${expires}.${sign(`${userId}.${expires}`)}`
  const store = await cookies()

  store.set(COOKIE_NAME, value, { ...cookieOptions(), maxAge: MAX_AGE_SECONDS })
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies()

  return readValue(store.get(COOKIE_NAME)?.value)
}

export async function clearSession(): Promise<void> {
  const store = await cookies()

  store.set(COOKIE_NAME, '', { ...cookieOptions(), maxAge: 0 })
}
