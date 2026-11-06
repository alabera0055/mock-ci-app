'use client'

import { useEffect, useState } from 'react'

import type { Job } from '@/lib/jobs'

const REFRESH_MS = 3000

const REQUEST_TEXT = `{
  "spaceId": "{spaceId}",
  "executionId": "{executionId}",
  "executionKey": "{executionKey}",
  "runId": "{runId}"
}`

export default function Home() {
  const [list, setList] = useState<Job[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/jobs', { cache: 'no-store' })

        setList((await response.json()) as Job[])
        setFailed(false)
      } catch {
        setFailed(true)
      }
    }

    void load()

    const timer = setInterval(() => void load(), REFRESH_MS)

    return () => clearInterval(timer)
  }, [])

  return (
    <main>
      <h1>Mock CI tool</h1>
      <p className='muted'>A pretend CI tool for testing Use another CI tool in Test Management.</p>

      <h2>Request text for the setting</h2>
      <div className='card'>
        <span className='muted'>Address path: </span>
        <code>/api/ci/start</code>
        <pre>{REQUEST_TEXT}</pre>
      </div>

      <h2>Jobs received ({list.length})</h2>
      {failed && <p className='status failed'>This page could not read the job list.</p>}
      {list.length === 0 && <p className='muted'>Nothing yet. Start a run from Test Management.</p>}

      {list.map(job => (
        <section key={job.id} className='card'>
          <div className='row'>
            <strong>
              {job.method} · {new Date(job.receivedAt).toLocaleTimeString()}
            </strong>
            <span className={`status ${job.status}`}>{job.status.replace('_', ' ')}</span>
          </div>
          <p>{job.message}</p>
          <div className='muted'>Headers received: {job.headerNames.join(', ')}</div>
          <pre>{JSON.stringify(job.body, null, 2)}</pre>
        </section>
      ))}
    </main>
  )
}
