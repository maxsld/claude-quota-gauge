import { expect, test } from 'claude-code/testing'

import { dueAlerts, projectFull, readings, settingsFrom } from '../hooks/gauge'

const HOUR = 3_600_000
const AT = Date.parse('2026-11-01T12:00:00Z')
const DEFAULTS = settingsFrom({})

test('settings fall back to their defaults', async () => {
  expect(DEFAULTS).toEqual({
    kinds: ['five_hour', 'seven_day'],
    alerts: true,
    warnAt: 80,
    pace: true,
    hour12: undefined,
  })
  expect(settingsFrom({ show: 'Weekly only', timeFormat: '12-hour' }).kinds).toEqual(['seven_day'])
  expect(settingsFrom({ timeFormat: '24-hour' }).hour12).toBe(false)
})

test('readings show percent used, high past the warning level', async () => {
  const rows = readings(
    [
      { kind: 'five_hour', percentUsed: 43.6, resetsAt: new Date(AT + 2 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 82, resetsAt: new Date(AT + 100 * HOUR).toISOString() },
    ],
    AT,
    { ...DEFAULTS, pace: false },
  )
  expect(rows.map(r => [r.name, r.used, r.isHigh])).toEqual([
    ['Session', 44, false],
    ['Weekly', 82, true],
  ])
})

test('a window past its reset reads zero', async () => {
  const rows = readings([{ kind: 'five_hour', percentUsed: 90, resetsAt: new Date(AT - 1).toISOString() }], AT, DEFAULTS)
  expect(rows[0]?.used).toBe(0)
  expect(rows[0]?.resetsAt).toBe(undefined)
})

test('the pace projects running out only when it comes before the reset', async () => {
  // 3 h into a 5 h window at 60%: 100% at 5 h, right at the reset, so no warning.
  expect(projectFull(60, AT, AT + 2 * HOUR, 5 * HOUR)).toBe(undefined)
  // 2 h in at 60%: 100% at 3h20, before the reset at 5 h.
  expect(projectFull(60, AT, AT + 3 * HOUR, 5 * HOUR)).toBe(AT + (4 / 3) * HOUR)
  // Too early in the window to say.
  expect(projectFull(30, AT, AT + 4.9 * HOUR, 5 * HOUR)).toBe(undefined)
})

test('alerts fire once per threshold', async () => {
  expect(dueAlerts(79, 0, 80)).toEqual([])
  expect(dueAlerts(81, 0, 80)).toEqual([80])
  expect(dueAlerts(81, 80, 80)).toEqual([])
  expect(dueAlerts(96, 80, 80)).toEqual([95])
  expect(dueAlerts(96, 0, 80)).toEqual([80, 95])
})
