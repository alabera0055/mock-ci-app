const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Reads string fields from a JSON body; anything missing or not a string becomes ''. */
export async function readFields<K extends string>(request: Request, names: readonly K[]): Promise<Record<K, string>> {
  let body: unknown = null

  try {
    body = await request.json()
  } catch {
    // A missing or broken body is treated as empty fields.
  }

  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

  return Object.fromEntries(
    names.map(name => {
      const value = source[name]

      return [name, typeof value === 'string' ? value : '']
    })
  ) as Record<K, string>
}

export function validateName(name: string): string | null {
  const length = name.trim().length

  return length >= 1 && length <= 80 ? null : 'Name must be 1 to 80 characters'
}

export function validateEmail(email: string): string | null {
  const value = email.trim()

  return value.length <= 254 && EMAIL.test(value) ? null : 'Enter a valid email address'
}

export function validatePassword(password: string, confirmPassword: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password !== confirmPassword) return 'Passwords do not match'

  return null
}
