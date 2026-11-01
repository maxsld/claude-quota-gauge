import { expect, mock, test } from 'claude-code/testing'

const AT = Date.parse('2026-11-01T12:00:00Z')

const BAND = {
  plugin: 'quota-gauge',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 44, resetsAt: new Date(AT + 2 * 3_600_000).toISOString() },
  { kind: 'seven_day', percentUsed: 7, resetsAt: new Date(AT + 100 * 3_600_000).toISOString() },
]

test('the band shows both windows as percent used, on every surface', async ($, on) => {
  mock.clock(on, { now: AT })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: AT, context: { window: 200_000 }, rateLimits: LIMITS },
  }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^Session$/ }))?.text).toBe('Session')
    expect((await ui.find({ type: 'Text', text: /^44%$/ }))?.text).toBe('44%')
    expect((await ui.find({ type: 'Text', text: /^7%$/ }))?.text).toBe('7%')
    await ui.unmount()
  }
})

test('the bars show from the start, filled from the account usage', async ($, on) => {
  const clock = mock.clock(on, { now: AT })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: AT, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({
    value: {
      status: 200,
      ok: true,
      headers: {},
      text: JSON.stringify({ five_hour: { utilization: 31, resets_at: LIMITS[0]?.resetsAt } }),
    },
  }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  // Before the answer lands, both bars are there, empty.
  expect((await ui.find({ type: 'Text', text: /^Weekly$/ }))?.text).toBe('Weekly')

  await clock.settle()
  expect((await ui.find({ type: 'Text', text: /^31%$/ }))?.text).toBe('31%')
  expect((await ui.find({ type: 'Text', text: /^–%$/ }))?.text).toBe('–%')
  await ui.unmount()
})
