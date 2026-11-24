import { expect, test, type APIRequestContext } from '@playwright/test'

// One test per ZZNEW test case. T4 and T6 fail on purpose, so Test Management shows both Passed and Failed.

const EMAIL = 'test@yopmail.com'
const PASSWORD = 'Admin@123'

const link = (key: string) => test.info().annotations.push({ type: 'test_key', description: key })

const logIn = (request: APIRequestContext, email = EMAIL, password = PASSWORD) =>
  request.post('/api/auth/login', { data: { email, password } })

test('ZZNEW-T1 Login with right password', async ({ page }) => {
  link('ZZNEW-T1')

  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(EMAIL)).toBeVisible()
})

test('TESTSAS-T16 Login ignores email case', async ({ request }) => {
  link('TESTSAS-T16')

  expect((await logIn(request, '  TEST@Yopmail.COM ')).status()).toBe(200)
})

test('TESTSAS-T17 Login refuses wrong password', async ({ request }) => {
  link('TESTSAS-T17')

  const response = await logIn(request, EMAIL, 'Wrong@123')

  expect(response.status()).toBe(401)
  expect(((await response.json()) as { error: string }).error).toBe('Wrong email or password')
})

test('TESTSAS-T18 Login refuses unknown email', async ({ request }) => {
  link('TESTSAS-T18)

  // Fails on purpose: the app answers 401, this expects 200.
  expect((await logIn(request, 'nobody@yopmail.com')).status()).toBe(200)
})

test('TESTSAS-T19 Login locks after 5 tries', async ({ request }) => {
  link('TESTSAS-T19')

  // A good login first, so earlier wrong tries don't count.
  await logIn(request)

  for (let attempt = 1; attempt <= 4; attempt++) {
    expect((await logIn(request, EMAIL, 'Wrong@123')).status()).toBe(401)
  }

  expect((await logIn(request, EMAIL, 'Wrong@123')).status()).toBe(429)
  expect((await logIn(request)).status()).toBe(429)
})

test('TESTSAS-T20 Login unlocks after 1 minute', async ({ request }) => {
  link('TESTSAS-T20')
  test.setTimeout(120_000)

  await new Promise(resolve => setTimeout(resolve, 61_000))

  // Fails on purpose: the app answers 200 after a minute, this expects 429.
  expect((await logIn(request)).status()).toBe(429)
})
