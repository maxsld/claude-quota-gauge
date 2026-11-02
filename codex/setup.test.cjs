'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { addLimits } = require('./setup.cjs')

test('an empty config gets a [tui] status line with both limits', () => {
  assert.equal(
    addLimits(''),
    '[tui]\nstatus_line = ["model-with-reasoning", "context-remaining", "current-dir", "five-hour-limit", "weekly-limit"]\n',
  )
})

test('other settings are kept and the table is appended after them', () => {
  const out = addLimits('model = "gpt-5"\n')
  assert.match(out, /^model = "gpt-5"\n\n\[tui\]\nstatus_line = \[.*"weekly-limit"\]\n$/)
})

test('an existing [tui] table without a status line gets one', () => {
  const out = addLimits('[tui]\nnotifications = true\n\n[mcp_servers.x]\ncommand = "x"\n')
  assert.match(out, /^\[tui\]\nstatus_line = \[.*\]\nnotifications = true\n\n\[mcp_servers\.x\]/)
})

test('an existing status line keeps its items, the missing limits are added', () => {
  const out = addLimits('[tui]\nstatus_line = [\n  "git-branch",\n  "weekly-limit",\n]\nanimations = false\n')
  assert.equal(out, '[tui]\nstatus_line = ["git-branch", "weekly-limit", "five-hour-limit"]\nanimations = false\n')
})

test('nothing changes when both limits are already there', () => {
  const toml = "[tui]\nstatus_line = ['five-hour-limit', 'weekly-limit']\n"
  assert.equal(addLimits(toml), toml)
})

test('a status_line in another table is not mistaken for the tui one', () => {
  const out = addLimits('[other]\nstatus_line = ["x"]\n\n[tui]\n')
  assert.match(out, /\[other\]\nstatus_line = \["x"\]/)
  assert.match(out, /\[tui\]\nstatus_line = \[.*"five-hour-limit"/)
})

test('dotted or inline tui settings are left alone', () => {
  assert.throws(() => addLimits('tui.status_line = ["x"]\n'))
  assert.throws(() => addLimits('tui = { status_line = ["x"] }\n'))
})
