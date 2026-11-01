import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RateLimit } from '../types'
import { dueAlerts, formatTime, readings, settingsFrom } from './gauge'
import type { Settings } from './gauge'

const TICK_MS = 60_000
// The last reading, kept across sessions so the gauge shows before the first reply.
const STORE_KEY = 'lastRateLimits'
// The highest threshold already alerted, per window instance (`kind@resetsAt`).
const ALERTED_KEY = 'alerted'

// Claude's orange, and red for a window nearly used up.
const ORANGE = '#D97757'
const RED = '#E5484D'

const snapshot = atom({ plugin: 'quota-gauge', key: 'snapshot' } as const, null)
// Bumped every minute so a window that just reset redraws while the session is idle.
const now = atom({ plugin: 'quota-gauge', key: 'now' } as const, 0)

function barSvg(used: number, w: number, isHigh: boolean): string {
  const color = isHigh ? RED : ORANGE
  const h = 5
  const fill = used > 0 ? Math.max(h, (used / 100) * w) : 0
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#8E8E93" fill-opacity="0.22"/>` +
    (fill > 0 ? `<rect width="${fill}" height="${h}" rx="${h / 2}" fill="${color}"/>` : '') +
    `</svg>`
  )
}

function textBar(used: number, width: number): [string, string] {
  const filled = Math.round((used / 100) * width)
  return ['━'.repeat(filled), '━'.repeat(width - filled)]
}

async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
}

async function alert($: EngineInterface, rateLimits: readonly RateLimit[], settings: Settings) {
  const at = await $.clock.now()
  const alerted = ((await $.store.get(ALERTED_KEY)) ?? {}) as Record<string, number>
  // Forgets windows that have reset since.
  const kept = Object.fromEntries(Object.entries(alerted).filter(([key]) => Date.parse(key.split('@')[1] ?? '') > at))
  let isChanged = Object.keys(kept).length !== Object.keys(alerted).length

  for (const r of readings(rateLimits, at, settings)) {
    if (r.resetsAt === undefined) continue
    const key = `${r.kind}@${new Date(r.resetsAt).toISOString()}`
    const top = dueAlerts(r.used, kept[key] ?? 0, settings.warnAt).at(-1)
    if (top === undefined) continue
    kept[key] = top
    isChanged = true
    const text = `${r.name} usage at ${r.used}% · resets ${formatTime(r.resetsAt, at, settings.hour12)}`
    const sent = await $.ui.notify(text, { title: 'Claude usage' })
    if (!sent.isSent) $.ui.toast(text, { timeoutMs: 8000 })
  }

  if (isChanged) await $.store.set(ALERTED_KEY, kept)
}

export const register: Register = (on, options) => {
  const settings = settingsFrom(options)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Clears the plain status line an earlier version of this plugin set.
    $.ui.status(undefined)
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) {
      await update($, snapshot, () => ({ rateLimits: usage.rateLimits, isStale: false }))
    } else {
      const saved = (await $.store.get(STORE_KEY)) as RateLimit[] | undefined
      await update($, snapshot, () => ({ rateLimits: saved ?? [], isStale: saved !== undefined }))
    }

    await tick($)
    $.clock.every(TICK_MS, () => void tick($))

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) {
      await update($, snapshot, () => ({ rateLimits: e.rateLimits, isStale: false }))
      if (e.changed.includes('rateLimits')) {
        await $.store.set(STORE_KEY, e.rateLimits)
        if (settings.alerts) await alert($, e.rateLimits, settings)
      }
    }
    await tick($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const snap = await read($, snapshot)
    const at = (await read($, now)) || (await $.clock.now())
    const rows = snap ? readings(snap.rateLimits, at, settings) : []

    if (rows.length === 0) {
      return (
        <Box paddingX="sm">
          <Text dimColor size="caption">
            Session and weekly usage appear after Claude's first reply.
          </Text>
        </Box>
      )
    }

    const barPx = e.props.bodyColumns >= 90 ? 140 : 90
    const barCells = Math.max(6, Math.min(20, Math.floor(e.props.bodyColumns / 2) - 30))

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="xl" rowGap="xs" paddingX="sm" paddingY="xs">
        {rows.map(r => (
          <Box key={r.name} flexDirection="row" alignItems="center" columnGap="sm">
            <Text dimColor size="caption">
              {r.name}
            </Text>
            {Svg ? (
              <Svg source={barSvg(r.used, barPx, r.isHigh)} alt={`${r.name}: ${r.used}%`} width={barPx} height={5} />
            ) : (
              <Text>
                <Text color={r.isHigh ? 'error' : 'claude'}>{textBar(r.used, barCells)[0]}</Text>
                <Text dimColor>{textBar(r.used, barCells)[1]}</Text>
              </Text>
            )}
            <Text size="caption" tabular>
              {r.used}%
            </Text>
            {r.resetsAt !== undefined && (
              <Text dimColor size="caption" tabular>
                ↻ {formatTime(r.resetsAt, at, settings.hour12)}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
