'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'

export interface Field {
  name: string
  label: string
  type: 'text' | 'email' | 'password'
  autoComplete: string
}

interface Props {
  title: string
  action: string
  fields: Field[]
  submitLabel: string
  // Where to go after success; without it the server's message is shown instead.
  next?: string
  extra?: Record<string, string>
  children?: ReactNode
}

export default function AuthForm({ title, action, fields, submitLabel, next, extra, children }: Props) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const values = Object.fromEntries(new FormData(event.currentTarget))

    setBusy(true)
    setError('')

    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, ...extra })
      })

      const answer = (await response.json().catch(() => ({}))) as { error?: string; message?: string }

      if (!response.ok) {
        setError(answer.error ?? `Something went wrong (${response.status}). See the server console.`)

        return
      }

      if (next) {
        router.replace(next)
        router.refresh()

        return
      }

      setMessage(answer.message ?? 'Done.')
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className='narrow'>
      <h1>{title}</h1>
      <div className='card'>
        {message ? (
          <p className='status passed'>{message}</p>
        ) : (
          <form className='form' onSubmit={submit}>
            {fields.map(field => (
              <label key={field.name}>
                {field.label}
                <input name={field.name} type={field.type} autoComplete={field.autoComplete} required />
              </label>
            ))}
            {error && (
              <p className='status failed' role='alert'>
                {error}
              </p>
            )}
            <button className='button' type='submit' disabled={busy}>
              {busy ? 'Please wait…' : submitLabel}
            </button>
          </form>
        )}
      </div>
      {children && <p className='muted'>{children}</p>}
    </main>
  )
}
