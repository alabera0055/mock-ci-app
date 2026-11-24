// Turns a Jest, Vitest, Playwright or Mocha JSON report, or JUnit XML (Cypress, node:test), into JUnit with one test case per test file.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const [input, output, root = process.cwd()] = process.argv.slice(2)

const stop = message => {
  console.error(message)
  process.exit(1)
}

if (!input || !output) stop('Usage: node scripts/junit-per-file.mjs <report.json> <out.xml> [root]')

// The other formats are turned into Jest's shape so the rest of the script stays the same.
const byFile = tests => {
  const files = new Map()

  for (const { file, crash, ...test } of tests) {
    if (!files.has(file)) files.set(file, { name: file, assertionResults: [] })
    if (crash) files.get(file).testExecError = { message: crash }
    else files.get(file).assertionResults.push(test)
  }

  return { testResults: [...files.values()] }
}

const PLAYWRIGHT_STATUS = { expected: 'passed', flaky: 'passed', unexpected: 'failed', skipped: 'skipped' }

const fromPlaywright = report => {
  const base = report.config.rootDir ?? root
  const tests = []

  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? []
        const last = results.at(-1)
        const error = last?.error?.message ?? last?.errors?.[0]?.message
        const project = test.projectName ? `[${test.projectName}] ` : ''

        tests.push({
          file: resolve(base, spec.file ?? suite.file),
          status: PLAYWRIGHT_STATUS[test.status] ?? 'failed',
          fullName: project + [...titles, spec.title].join(' › '),
          title: spec.title,
          duration: results.reduce((sum, result) => sum + (result.duration ?? 0), 0),
          failureMessages: error ? [error] : []
        })
      }
    }

    for (const child of suite.suites ?? []) walk(child, [...titles, child.title])
  }

  // The top suite of each file is titled with the file name, so it is left out of the test names.
  for (const suite of report.suites) walk(suite, [])

  // A file that fails to load has no suite, only an error that points at it.
  for (const error of report.errors ?? []) {
    if (error.location?.file) tests.push({ file: resolve(base, error.location.file), crash: error.message ?? 'Error' })
  }

  return byFile(tests)
}

const fromMocha = report => {
  const key = test => `${test.file}\n${test.fullTitle}`
  const failed = new Set((report.failures ?? []).map(key))
  const pending = new Set((report.pending ?? []).map(key))
  const listed = new Set(report.tests.map(key))

  // Failed hooks and some pending tests only show up in their own lists.
  const extra = [...(report.failures ?? []), ...(report.pending ?? [])].filter(test => !listed.has(key(test)))

  return byFile(
    [...report.tests, ...extra].map(test => ({
      file: resolve(root, test.file ?? 'unknown file'),
      status: failed.has(key(test)) || test.err?.message ? 'failed' : pending.has(key(test)) ? 'skipped' : 'passed',
      fullName: test.fullTitle ?? test.title,
      title: test.title,
      duration: test.duration ?? 0,
      failureMessages: test.err?.message ? [test.err.message] : []
    }))
  )
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decode = text =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return ENTITIES[code] ?? whole

    return String.fromCodePoint(
      code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    )
  })

const readAttributes = text =>
  Object.fromEntries(
    [...text.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, name, double, single]) => [
      name,
      decode(double ?? single)
    ])
  )

// Comments, CDATA, declarations, tags (quoted values may hold ">") and text.
const XML_TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][^>]*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g

const fromJUnit = documents => {
  const tests = []
  let found = documents.length === 0

  for (const xml of documents) {
    const suiteFiles = []
    let firstFile
    let current
    let message

    const endFailure = () => {
      current.failureMessages.push(message.trim())
      message = undefined
    }

    const endCase = () => {
      if (message !== undefined) endFailure()
      tests.push(current)
      current = undefined
    }

    for (const [, cdata, closing, tag, attributeText, selfClosing, text] of xml.matchAll(XML_TOKEN)) {
      if (!tag) {
        if (message !== undefined) message += cdata ?? decode(text ?? '')
        continue
      }

      if (closing) {
        if (tag === 'testsuite') suiteFiles.pop()
        else if (tag === 'testcase' && current) endCase()
        else if ((tag === 'failure' || tag === 'error') && current && message !== undefined) endFailure()
        continue
      }

      const attributes = readAttributes(attributeText)

      if (tag === 'testsuite' || tag === 'testsuites') found = true

      if (tag === 'testsuite') {
        firstFile ??= attributes.file
        if (!selfClosing) suiteFiles.push(attributes.file)
      } else if (tag === 'testcase') {
        found = true

        // Cypress only puts the spec file on the first suite of each report.
        const file = attributes.file ?? suiteFiles.findLast(Boolean) ?? firstFile ?? attributes.classname

        current = {
          file: resolve(root, file ?? 'unknown file'),
          status: 'passed',
          fullName: attributes.name,
          title: attributes.name,
          duration: (Number(attributes.time) || 0) * 1000,
          failureMessages: []
        }

        if (selfClosing) endCase()
      } else if ((tag === 'failure' || tag === 'error') && current) {
        current.status = 'failed'
        message = attributes.message ? `${attributes.message}\n` : ''
        if (selfClosing) endFailure()
      } else if (tag === 'skipped' && current && current.status !== 'failed') {
        current.status = 'skipped'
      }
    }
  }

  return found ? byFile(tests) : {}
}

const readReport = path => {
  if (existsSync(path) && statSync(path).isDirectory()) {
    const names = readdirSync(path)
      .filter(name => name.endsWith('.xml'))
      .sort()

    return fromJUnit(names.map(name => readFileSync(join(path, name), 'utf8')))
  }

  const text = readFileSync(path, 'utf8')

  if (text.trimStart().startsWith('<')) return fromJUnit([text])

  const data = JSON.parse(text)

  if (Array.isArray(data?.testResults)) return data
  if (data?.config && Array.isArray(data.suites)) return fromPlaywright(data)
  if (data?.stats && Array.isArray(data.tests)) return fromMocha(data)

  return data
}

let report

try {
  report = readReport(input)
} catch (error) {
  stop(`Cannot read the test report ${input}: ${error.message}`)
}

if (!Array.isArray(report?.testResults)) {
  stop(`${input} is not a Jest, Vitest, Playwright or Mocha JSON report, or a JUnit XML report or folder`)
}

if (report.testResults.length === 0) stop(`${input} has no test files`)

const MESSAGE_LIMIT = 4000
const SKIPPED = new Set(['pending', 'skipped', 'todo', 'disabled'])

// Colour codes and characters XML can't hold would break the report.
const clean = text =>
  String(text ?? '')
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cap = text => (text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}\n…` : text)

const firstLines = text => clean(text).split('\n').slice(0, 6).join('\n')

const toCase = file => {
  const path = relative(root, file.name).split('\\').join('/')
  const tests = file.assertionResults ?? []
  const failed = tests.filter(test => test.status === 'failed')

  const crash = clean(
    file.testExecError?.message ?? (failed.length === 0 && file.status === 'failed' ? file.message : '')
  )

  // Vitest's file span only covers collecting results, so the test times can be longer.
  const span = file.endTime && file.startTime ? file.endTime - file.startTime : 0
  const testTime = tests.reduce((sum, test) => sum + (test.duration ?? 0), 0)
  const time = Math.max(0, Math.max(span, testTime) / 1000).toFixed(3)

  if (failed.length > 0 || crash) {
    const summary = crash ? 'The test file could not run' : `${failed.length} of ${tests.length} tests failed`

    const details =
      crash ||
      failed
        .map(test => `✕ ${clean(test.fullName ?? test.title)}\n${firstLines(test.failureMessages?.[0])}`)
        .join('\n\n')

    return {
      path,
      time,
      state: 'failed',
      body: `<failure message="${escape(summary)}">${escape(cap(details))}</failure>`
    }
  }

  if (tests.length === 0 || tests.every(test => SKIPPED.has(test.status))) {
    return { path, time, state: 'skipped', body: '<skipped/>' }
  }

  return { path, time, state: 'passed', body: '' }
}

// With XISUITE_RESULTS=per-test every test is its own result, named "<file> › <test name>".
const perTest = process.env.XISUITE_RESULTS === 'per-test'

const toTestCases = file => {
  const whole = toCase(file)
  const tests = file.assertionResults ?? []

  // A file that could not run has no tests of its own, so it stays one result.
  if (file.testExecError || tests.length === 0) return [whole]

  return tests.map(test => {
    const state = test.status === 'failed' ? 'failed' : SKIPPED.has(test.status) ? 'skipped' : 'passed'
    const message = clean((test.failureMessages ?? []).join('\n\n'))

    return {
      path: `${whole.path} › ${clean(test.fullName ?? test.title)}`,
      time: Math.max(0, (test.duration ?? 0) / 1000).toFixed(3),
      state,
      body:
        state === 'failed'
          ? `<failure message="Test failed">${escape(cap(message))}</failure>`
          : state === 'skipped'
            ? '<skipped/>'
            : ''
    }
  })
}

const cases = (perTest ? report.testResults.flatMap(toTestCases) : report.testResults.map(toCase)).sort((a, b) =>
  a.path.localeCompare(b.path)
)
const count = state => cases.filter(item => item.state === state).length
const total = cases.reduce((sum, item) => sum + Number(item.time), 0).toFixed(3)
const attributes = `tests="${cases.length}" failures="${count('failed')}" skipped="${count('skipped')}" time="${total}"`

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<testsuites name="test files" ${attributes}>`,
  `<testsuite name="test files" ${attributes}>`,
  ...cases.map(item => `<testcase name="${escape(item.path)}" time="${item.time}">${item.body}</testcase>`),
  '</testsuite>',
  '</testsuites>',
  ''
].join('\n')

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, xml)
console.log(`Wrote ${cases.length} ${perTest ? 'tests' : 'test files'} to ${output} (${count('failed')} failed, ${count('skipped')} skipped)`)
