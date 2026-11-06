export type JobStatus = 'running' | 'passed' | 'failed' | 'results_failed'

export interface Job {
  id: string
  receivedAt: string
  method: string
  // Names only, so a token never reaches the page.
  headerNames: string[]
  body: Record<string, unknown>
  status: JobStatus
  message: string
}

// The tests this pretend job reports. The backend matches classname.name against each test case's automation key.
export const TESTS = [
  { classname: 'auth', name: 'login.valid', seconds: 1.4 },
  { classname: 'auth', name: 'login.wrong-password', seconds: 0.9 },
  { classname: 'payments', name: 'card.success', seconds: 3.2, failure: 'Card was declined' }
]

// Kept on globalThis so a dev reload doesn't empty the list. Lost when the app stops.
const store = globalThis as typeof globalThis & { mockCiJobs?: Job[] }

export function jobs(): Job[] {
  store.mockCiJobs ??= []

  return store.mockCiJobs
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function junitReport(): string {
  const failures = TESTS.filter(test => test.failure).length

  const cases = TESTS.map(test => {
    const open = `<testcase classname="${escapeXml(test.classname)}" name="${escapeXml(test.name)}" time="${test.seconds}"`

    return test.failure ? `${open}><failure message="${escapeXml(test.failure)}"/></testcase>` : `${open}/>`
  }).join('\n    ')

  return `<testsuites>
  <testsuite name="mock-ci" tests="${TESTS.length}" failures="${failures}">
    ${cases}
  </testsuite>
</testsuites>
`
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** With an execution id the results join it; without one the backend creates a new execution. */
async function sendResults(job: Job): Promise<string> {
  const apiKey = process.env.XISUITE_TM_KEY
  const apiUrl = process.env.XISUITE_API_URL ?? 'http://localhost:3001/api/v1'
  const spaceId = text(job.body.spaceId)
  const executionId = text(job.body.executionId)

  if (!apiKey) return 'No XISUITE_TM_KEY set, so no results were sent.'
  if (!spaceId) return 'The request text had no spaceId, so no results were sent.'

  const form = new FormData()

  form.append('file', new Blob([junitReport()], { type: 'application/xml' }), 'results.xml')

  const path = executionId ? `executions/${encodeURIComponent(executionId)}/junit/commit` : 'import/results'

  const response = await fetch(`${apiUrl}/spaces/${encodeURIComponent(spaceId)}/test-management/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  })

  const answer = (await response.text()).slice(0, 400)

  if (!response.ok) throw new Error(`Results refused with ${response.status}: ${answer}`)

  return `Results sent (${response.status}): ${answer}`
}

export function runJob(job: Job): void {
  const seconds = Number(process.env.JOB_SECONDS ?? 15)

  setTimeout(async () => {
    try {
      job.message = await sendResults(job)
      job.status = TESTS.some(test => test.failure) ? 'failed' : 'passed'
    } catch (error) {
      job.status = 'results_failed'
      job.message = error instanceof Error ? error.message : String(error)
    }
  }, seconds * 1000)
}
