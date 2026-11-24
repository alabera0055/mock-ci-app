// XISUITE self-test: create, read, update and delete a test case in the Test cases panel through the backend API.
const { test, expect, request } = require('@playwright/test')

const API = (process.env.API_URL || process.env.TM_API_URL || 'https://api.xisuite.cloud/api/v1').replace(/\/$/, '')
const TENANT_SLUG = process.env.TENANT_SLUG || 'ambertech-solutions'
const SPACE_ID = process.env.SPACE_ID || process.env.TM_SPACE_ID || 'd253b1d3-4783-485f-bd38-7f5cd12246ed'
const CASES = `${API}/spaces/${SPACE_ID}/test-management/cases`

const stamp = Date.now()
const title = `Self-test case ${stamp}`
const objective = `Created by the XISUITE self-test ${stamp}`
const newTitle = `Self-test case ${stamp} changed`
const newObjective = `Changed by the XISUITE self-test ${stamp}`

// The automation server reaches the internet only through its proxy, which the request client doesn't pick up by itself.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.XISUITE_PROXY
const proxy = proxyUrl ? { proxy: { server: proxyUrl } } : {}

let api
let caseId = ''
let revision = 0

async function call(method, url, data) {
  const response = await api.fetch(url, { method, ...(data ? { data } : {}) })
  const text = await response.text()
  let json = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  return { status: response.status(), data: json?.data ?? json, text }
}

const failure = (label, result) => `${label} gave ${result.status}: ${result.text.slice(0, 300)}`

test.describe('Test cases panel CRUD', () => {
  test.beforeAll(async () => {
    expect(process.env.QA_EMAIL && process.env.QA_PASSWORD, 'QA_EMAIL and QA_PASSWORD must be set as secrets').toBeTruthy()

    const signin = await request.newContext({ ...proxy, extraHTTPHeaders: { 'X-Tenant-Slug': TENANT_SLUG } })
    const response = await signin.post(`${API}/auth/signin`, {
      data: { email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD }
    })
    const body = await response.json().catch(() => ({}))
    const result = body?.data ?? body

    expect(response.ok(), `sign-in gave ${response.status()}: ${JSON.stringify(body).slice(0, 300)}`).toBe(true)
    expect(result?.mfaRequired, 'the QA account needs two-step sign-in; use an account without it').toBeFalsy()

    const cookie = response
      .headersArray()
      .filter(header => header.name.toLowerCase() === 'set-cookie')
      .map(header => header.value)
      .find(value => value.startsWith('access_token='))
    const token = result?.access_token ?? cookie?.split(';')[0].slice('access_token='.length)

    await signin.dispose()
    expect(token, `sign-in gave no token (status ${response.status()})`).toBeTruthy()

    api = await request.newContext({
      ...proxy,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, Cookie: `access_token=${token}`, 'X-Tenant-Slug': TENANT_SLUG }
    })

    // A 403 here means Test Management is off for the space or the account lacks access.
    const list = await call('GET', CASES)

    expect(list.status, failure(`test case list in space ${SPACE_ID}`, list)).toBe(200)
  })

  test.afterAll(async () => {
    // A case left behind by a failed step is removed so the space stays clean.
    if (caseId) await call('DELETE', `${CASES}/${caseId}`).catch(() => null)
    await api?.dispose()
  })

  test.describe.configure({ mode: 'serial' })

  test('Create a test case', async () => {
    const created = await call('POST', CASES, { title, objective })

    expect(created.status, failure('create', created)).toBe(201)
    expect(created.data?.id).toBeTruthy()
    expect(created.data?.title).toBe(title)

    caseId = created.data.id
    revision = created.data.revision
  })

  test('Read the test case', async () => {
    expect(caseId, 'the create step did not finish').toBeTruthy()

    const read = await call('GET', `${CASES}/${caseId}`)

    expect(read.status, failure('read', read)).toBe(200)
    expect(read.data?.title).toBe(title)
    expect(read.data?.objective).toBe(objective)

    revision = read.data.revision
  })

  test('Update the test case', async () => {
    expect(caseId, 'the create step did not finish').toBeTruthy()

    const updated = await call('PATCH', `${CASES}/${caseId}`, {
      expected_revision: revision,
      title: newTitle,
      objective: newObjective
    })

    expect(updated.status, failure('update', updated)).toBe(200)

    const read = await call('GET', `${CASES}/${caseId}`)

    expect(read.data?.title).toBe(newTitle)
    expect(read.data?.objective).toBe(newObjective)
  })

  test('Delete the test case', async () => {
    expect(caseId, 'the create step did not finish').toBeTruthy()

    const removed = await call('DELETE', `${CASES}/${caseId}`)

    expect(removed.status, failure('delete', removed)).toBe(200)

    const read = await call('GET', `${CASES}/${caseId}`)

    expect(read.status, 'the deleted test case can still be read').toBe(404)
    caseId = ''
  })
})
