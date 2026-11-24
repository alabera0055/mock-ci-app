import { defineConfig } from '@playwright/test'

// Its own port, so a dev server you already run on 4000 is left alone.
const PORT = 4100

// Test cases run from tests/login.spec.ts:
//   ZZNEW-T1 Login with right password      pass
//   ZZNEW-T2 Login ignores email case       pass
//   ZZNEW-T3 Login refuses wrong password   pass
//   ZZNEW-T4 Login refuses unknown email    FAIL (on purpose)
//   ZZNEW-T5 Login locks after 5 tries      pass
//   ZZNEW-T6 Login unlocks after 1 minute   FAIL (on purpose)

// Listing runs no test, so it must not write a results.xml full of "skipped".
const LISTING = process.argv.includes('--list')

export default defineConfig({
  testDir: 'tests',

  // The app has one shared account, so the files run one after another, never at the same time.
  workers: 1,
  reporter: LISTING
    ? [['list']]
    : [['list'], ['junit', { outputFile: 'results.xml', embedAnnotationsAsProperties: true }]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 120_000,

    // A long job time keeps the pretend job from sending results while the tests run.
    env: { CI_ACCESS_TOKEN: 'playwright-token', JOB_SECONDS: '600' }
  }
})
