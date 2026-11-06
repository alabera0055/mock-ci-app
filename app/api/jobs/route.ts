import { NextResponse } from 'next/server'

import { jobs } from '@/lib/jobs'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(jobs())
}
