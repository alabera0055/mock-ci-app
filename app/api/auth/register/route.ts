import { NextResponse } from 'next/server'

import { setSession } from '@/lib/session'
import { createUser } from '@/lib/users'
import { readFields, validateEmail, validateName, validatePassword } from '@/lib/validate'

export async function POST(request: Request) {
  const { name, email, password, confirmPassword } = await readFields(request, [
    'name',
    'email',
    'password',
    'confirmPassword'
  ])

  const problem = validateName(name) ?? validateEmail(email) ?? validatePassword(password, confirmPassword)

  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const user = createUser(name, email, password)

  if (!user) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })

  await setSession(user.id)

  return NextResponse.json({ ok: true }, { status: 201 })
}
