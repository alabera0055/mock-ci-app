import Link from 'next/link'

import AuthForm from '@/app/AuthForm'
import LogoutButton from '@/app/LogoutButton'
import { getSessionUserId } from '@/lib/session'
import { findUserById } from '@/lib/users'

export default async function LoginPage() {
  const user = findUserById(await getSessionUserId())

  if (user) {
    return (
      <main className='narrow'>
        <h1>Log in</h1>
        <div className='card form'>
          <p>
            Logged in as <strong>{user.name}</strong> ({user.email}).
          </p>
          <LogoutButton />
        </div>
        <p className='muted'>
          <Link href='/'>Back to the jobs</Link>
        </p>
      </main>
    )
  }

  return (
    <AuthForm
      title='Log in'
      action='/api/auth/login'
      submitLabel='Log in'
      next='/'
      fields={[
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' }
      ]}
    >
      <Link href='/register'>Create an account</Link>
    </AuthForm>
  )
}
