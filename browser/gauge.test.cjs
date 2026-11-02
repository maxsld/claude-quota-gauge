'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseUsage, readings, dueAlerts, pickOrg } = require('./gauge.js')

const AT = Date.parse('2026-11-01T12:00:00Z')

test('the usage answer is read as percent used with reset times', () => {
  assert.deepEqual(
    parseUsage({
      five_hour: { utilization: 44, resets_at: '2026-11-01T14:00:00.123+00:00' },
      seven_day: { utilization: 7.25, resets_at: '2026-11-07T00:00:00Z' },
      seven_day_opus: null,
    }),
    [
      { kind: 'five_hour', percentUsed: 44, resetsAt: Date.parse('2026-11-01T14:00:00.123Z') },
      { kind: 'seven_day', percentUsed: 7.25, resetsAt: Date.parse('2026-11-07T00:00:00Z') },
    ],
  )
  assert.deepEqual(parseUsage({ five_hour: null, seven_day: { utilization: 'x' } }), [])
  assert.deepEqual(parseUsage(null), [])
})

test('both bars always show, high past 80%, zero once reset', () => {
  const rows = readings(
    [
      { kind: 'five_hour', percentUsed: 90, resetsAt: AT - 1 },
      { kind: 'seven_day', percentUsed: 82.4, resetsAt: AT + 1000 },
    ],
    AT,
  )
  assert.deepEqual(rows.map(r => [r.name, r.used, r.isHigh]), [['Session', 0, false], ['Weekly', 82, true]])
  assert.deepEqual(readings([], AT).map(r => r.used), [undefined, undefined])
})

test('alerts fire once per threshold', () => {
  assert.deepEqual(dueAlerts(79, 0), [])
  assert.deepEqual(dueAlerts(81, 0), [80])
  assert.deepEqual(dueAlerts(81, 80), [])
  assert.deepEqual(dueAlerts(96, 0), [80, 95])
})

test('the organization is the one last open, else the first that chats', () => {
  const orgs = [{ uuid: 'api', capabilities: ['api'] }, { uuid: 'me', capabilities: ['chat', 'claude_pro'] }]
  assert.equal(pickOrg(orgs, 'api'), 'api')
  assert.equal(pickOrg(orgs, undefined), 'me')
  assert.equal(pickOrg([], 'x'), undefined)
})
