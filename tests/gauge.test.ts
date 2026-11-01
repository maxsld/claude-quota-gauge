import { expect, test } from 'claude-code/testing'

import { dueAlerts, readings, settingsFrom } from '../hooks/gauge'

const HOUR = 3_600_000
const AT = Date.parse('2026-11-01T12:00:00Z')
const DEFAULTS = settingsFrom({})

test('settings fall back to their defaults', async () => {
  expect(DEFAULTS).toEqual({
    kinds: ['five_hour', 'seven_day'],
    alerts: true,
    warnAt: 80,
    hour12: false,
  })
  expect(settingsFrom({ show: 'Weekly only', timeFormat: '12-hour' }).kinds).toEqual(['seven_day'])
  expect(settingsFrom({ timeFormat: 'System' }).hour12).toBe(undefined)
})

test('readings show percent used, high past the warning level', async () => {
  const rows = readings(
    [
      { kind: 'five_hour', percentUsed: 43.6, resetsAt: new Date(AT + 2 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 82, resetsAt: new Date(AT + 100 * HOUR).toISOString() },
    ],
    AT,
    DEFAULTS,
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

test('alerts fire once per threshold', async () => {
  expect(dueAlerts(79, 0, 80)).toEqual([])
  expect(dueAlerts(81, 0, 80)).toEqual([80])
  expect(dueAlerts(81, 80, 80)).toEqual([])
  expect(dueAlerts(96, 80, 80)).toEqual([95])
  expect(dueAlerts(96, 0, 80)).toEqual([80, 95])
})
