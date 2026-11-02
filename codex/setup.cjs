#!/usr/bin/env node
// Turns on Codex CLI's own usage items (5-hour and weekly limits) in its footer status line.
// Edits `[tui] status_line` in ~/.codex/config.toml (or $CODEX_HOME/config.toml), keeps a .bak copy, and never
// touches anything else. Run it again any time: it changes nothing once the items are there.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const ITEMS = ['five-hour-limit', 'weekly-limit']
// Used only when no status line is set yet; Codex then shows exactly these items.
const DEFAULT_LINE = ['model-with-reasoning', 'context-remaining', 'current-dir', ...ITEMS]

const format = items => `status_line = [${items.map(i => JSON.stringify(i)).join(', ')}]`

// Returns the new config text, the same text when nothing is needed, or throws when the layout is one it won't guess at.
function addLimits(toml) {
  const nl = toml.includes('\r\n') ? '\r\n' : '\n'
  if (/^\s*tui\s*(=|\.)/m.test(toml)) {
    throw new Error('`tui` is set with a dotted key or inline table; add the items with /statusline instead')
  }
  const header = /^[ \t]*\[[ \t]*tui[ \t]*\][ \t]*(#.*)?$/m.exec(toml)
  if (!header) {
    const sep = toml === '' || toml.endsWith(nl + nl) ? '' : toml.endsWith(nl) ? nl : nl + nl
    return `${toml}${sep}[tui]${nl}${format(DEFAULT_LINE)}${nl}`
  }
  const bodyStart = header.index + header[0].length
  const next = /^[ \t]*\[/m.exec(toml.slice(bodyStart))
  const bodyEnd = next ? bodyStart + next.index : toml.length
  const body = toml.slice(bodyStart, bodyEnd)

  const key = /^[ \t]*status_line[ \t]*=[ \t]*\[/m.exec(body)
  if (!key) {
    return toml.slice(0, bodyStart) + nl + format(DEFAULT_LINE) + toml.slice(bodyStart)
  }
  const close = body.indexOf(']', key.index + key[0].length)
  if (close === -1) throw new Error('could not read `status_line` in [tui]')
  const inside = body.slice(key.index + key[0].length, close)
  const current = [...inside.matchAll(/"([^"]*)"|'([^']*)'/g)].map(m => m[1] ?? m[2])
  const missing = ITEMS.filter(i => !current.includes(i))
  if (missing.length === 0) return toml
  const line = body.slice(key.index).match(/^[ \t]*/)[0] + format([...current, ...missing])
  const start = bodyStart + key.index
  return toml.slice(0, start) + line + toml.slice(bodyStart + close + 1)
}

function main() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const file = path.join(home, 'config.toml')
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  let after
  try {
    after = addLimits(before)
  } catch (error) {
    console.error(`Left ${file} unchanged: ${error.message}.`)
    process.exit(1)
  }
  if (after === before) {
    console.log(`Codex already shows your 5-hour and weekly limits (${file}).`)
    return
  }
  fs.mkdirSync(home, { recursive: true })
  if (before !== '') fs.writeFileSync(`${file}.bak`, before)
  fs.writeFileSync(file, after)
  console.log(`Done: Codex now shows your 5-hour and weekly limits in its footer (${file}).`)
  console.log('Start a new Codex session; the figures appear after your first message.')
}

// Runs when started directly or piped in (`curl … | node`); not when the tests require it.
if (require.main === module || require.main === undefined) main()

module.exports = { addLimits, ITEMS }
