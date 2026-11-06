import { NextResponse, type NextRequest } from 'next/server'

import { jobs, runJob, type Job } from '@/lib/jobs'

const MAX_JOBS = 50

async function start(request: NextRequest) {
  const expected = process.env.CI_ACCESS_TOKEN

  if (!expected) return NextResponse.json({ error: 'CI_ACCESS_TOKEN is not set in .env.local' }, { status: 500 })

  if (request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Wrong or missing Authorization header' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}

  try {
    const parsed: unknown = await request.json()

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    // A job can be started with no body; there is just nowhere to send results.
  }

  const job: Job = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    method: request.method,
    headerNames: [...request.headers.keys()].sort(),
    body,
    status: 'running',
    message: 'The pretend job is running.'
  }

  const list = jobs()

  list.unshift(job)
  list.length = Math.min(list.length, MAX_JOBS)
  runJob(job)

  return NextResponse.json({ id: job.id, status: job.status }, { status: 202 })
}

export const POST = start
export const PUT = start
