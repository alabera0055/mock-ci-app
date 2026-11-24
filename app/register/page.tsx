import Link from 'next/link'
import { redirect } from 'next/navigation'

import AuthForm from '@/app/AuthForm'
import { getSessionUserId } from '@/lib/session'
import { findUserById } from '@/lib/users'

export default async function RegisterPage() {
  if (findUserById(await getSessionUserId())) redirect('/login')

  return (
    <AuthForm
      title='Create an account'
      action='/api/auth/register'
      submitLabel='Create account'
      next='/'
      fields={[
        { name: 'name', label: 'Name', type: 'text', autoComplete: 'name' },
        { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
        { name: 'password', label: 'Password (at least 8 characters)', type: 'password', autoComplete: 'new-password' },
        { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' }
      ]}
    >
      <Link href='/login'>I already have an account</Link>
    </AuthForm>
  )
}
