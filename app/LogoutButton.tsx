'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const logout = async () => {
    setBusy(true)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.refresh()
    setBusy(false)
  }

  return (
    <button className='button secondary' type='button' onClick={() => void logout()} disabled={busy}>
      {busy ? 'Please wait…' : 'Log out'}
    </button>
  )
}
