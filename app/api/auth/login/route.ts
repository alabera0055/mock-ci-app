import { NextResponse } from 'next/server'

import { setSession } from '@/lib/session'
import { checkLogin } from '@/lib/users'
import { readFields } from '@/lib/validate'

export async function POST(request: Request) {
  const { email, password } = await readFields(request, ['email', 'password'])
  const result = checkLogin(email, password)

  if (result.ok) {
    await setSession(result.user.id)

    return NextResponse.json({ ok: true })
  }

  if (result.locked) {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 })
  }

  return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 })
}
