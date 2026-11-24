import { expect, test, type APIRequestContext } from '@playwright/test'

// The login test cases are in login.spec.ts; these check the rest of the app.

const TOKEN = 'playwright-token'
const EMAIL = 'test@yopmail.com'
const PASSWORD = 'Admin@123'

const logIn = (request: APIRequestContext) => request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })

test('home page sends a visitor to log in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('register accepts only the test account', async ({ request }) => {
  const form = (email: string) => ({ name: 'Tester', email, password: PASSWORD, confirmPassword: PASSWORD })

  expect((await request.post('/api/auth/register', { data: form('other@yopmail.com') })).status()).toBe(403)
  expect((await request.post('/api/auth/register', { data: form(EMAIL) })).status()).toBe(409)
})

test('job list API needs a login', async ({ request }) => {
  expect((await request.get('/api/jobs')).status()).toBe(401)
  expect((await logIn(request)).status()).toBe(200)

  const response = await request.get('/api/jobs')

  expect(response.ok()).toBe(true)
  expect(Array.isArray(await response.json())).toBe(true)
})

test('starting a job records it as running', async ({ request }) => {
  const response = await request.post('/api/ci/start', {
    headers: { authorization: TOKEN },
    data: { spaceId: 'space-1', runId: 'run-1' }
  })

  expect(response.status()).toBe(202)

  const started = (await response.json()) as { id: string; status: string }

  await logIn(request)

  const list = (await (await request.get('/api/jobs')).json()) as { id: string }[]

  expect(started.status).toBe('running')
  expect(list.some(job => job.id === started.id)).toBe(true)
})

test('a started job appears on the dashboard', async ({ page }) => {
  const runId = `shown-${Date.now()}`

  await page.request.post('/api/ci/start', { headers: { authorization: TOKEN }, data: { runId } })
  await logIn(page.request)
  await page.goto('/dashboard')
  await expect(page.getByText(`"runId": "${runId}"`)).toBeVisible()
})

test('a wrong token is refused', async ({ request }) => {
  const response = await request.post('/api/ci/start', { headers: { authorization: 'wrong' }, data: {} })

  expect(response.status()).toBe(401)
})
