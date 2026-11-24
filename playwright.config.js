// API tests only, so no browser is started.
const fs = require('node:fs')
const { defineConfig } = require('@playwright/test')

const outputFile = process.env.XISUITE_RESULT || process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME || 'junit.xml'

// An old report from an earlier run is removed so it is never read as this run's result.
fs.rmSync(outputFile, { force: true })

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['junit', { outputFile, embedAnnotationsAsProperties: true }]]
})
