import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RateLimit } from '../types'
import { dueAlerts, formatTime, merge, parseUsage, readings, settingsFrom } from './gauge'
import type { Settings } from './gauge'

const TICK_MS = 60_000
// How often the account's usage is read while the session is idle, so use from elsewhere shows too.
const FETCH_MS = 5 * 60_000
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
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

// Reads the account's usage the way /usage does, through the session's own login; the token never reaches the plugin.
async function fetchUsage($: EngineInterface): Promise<RateLimit[]> {
  try {
    const authorization = await $.session.authorize()
    if (authorization?.kind !== 'bearer') return []
    const response = await $.http.fetch(USAGE_URL, {
      auth: authorization.handle,
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    return response.ok ? parseUsage(JSON.parse(response.text)) : []
  } catch {
    return []
  }
}

async function refresh($: EngineInterface, settings: Settings) {
  const fetched = await fetchUsage($)
  if (fetched.length === 0) return
  await apply($, fetched, settings)
}

async function apply($: EngineInterface, rateLimits: readonly RateLimit[], settings: Settings) {
  const snap = await read($, snapshot)
  const merged = merge(snap?.rateLimits ?? [], rateLimits)
  await update($, snapshot, () => ({ rateLimits: merged, isStale: false }))
  await $.store.set(STORE_KEY, merged)
  if (settings.alerts) await alert($, merged, settings)
  await tick($)
}

async function alert($: EngineInterface, rateLimits: readonly RateLimit[], settings: Settings) {
  const at = await $.clock.now()
  const alerted = ((await $.store.get(ALERTED_KEY)) ?? {}) as Record<string, number>
  // Forgets windows that have reset since.
  const kept = Object.fromEntries(Object.entries(alerted).filter(([key]) => Date.parse(key.split('@')[1] ?? '') > at))
  let isChanged = Object.keys(kept).length !== Object.keys(alerted).length

  for (const r of readings(rateLimits, at, settings)) {
    if (r.resetsAt === undefined || r.used === undefined) continue
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
    // The last known figures first, so the bars show at once; fresh ones follow.
    const saved = ((await $.store.get(STORE_KEY)) ?? []) as RateLimit[]
    const usage = await $.session.usage()
    await update($, snapshot, () => ({
      rateLimits: merge(saved, usage.rateLimits),
      isStale: usage.rateLimits.length === 0,
    }))
    await tick($)

    $.clock.after(0, () => void refresh($, settings))
    $.clock.every(TICK_MS, () => void tick($))
    $.clock.every(FETCH_MS, () => void refresh($, settings))

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0 && e.changed.includes('rateLimits')) await apply($, e.rateLimits, settings)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Another plugin's band is kept and drawn beside the gauge.
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const snap = await read($, snapshot)
    const at = (await read($, now)) || (await $.clock.now())
    const rows = readings(snap?.rateLimits ?? [], at, settings)

    const barPx = e.props.bodyColumns >= 90 ? 140 : 90
    const barCells = Math.max(6, Math.min(20, Math.floor(e.props.bodyColumns / 2) - 30))

    const gauge = (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap="xl"
        rowGap="xs"
        paddingX="sm"
        paddingY="xs"
      >
        {rows.map(r => {
          const used = r.used ?? 0
          return (
            <Box key={r.name} flexDirection="row" alignItems="center" columnGap="sm">
              <Text dimColor size="caption">
                {r.name}
              </Text>
              {Svg ? (
                <Svg
                  source={barSvg(used, barPx, r.isHigh)}
                  alt={`${r.name}: ${r.used ?? '–'}%`}
                  width={barPx}
                  height={5}
                />
              ) : (
                <Text>
                  <Text color={r.isHigh ? 'error' : 'claude'}>{textBar(used, barCells)[0]}</Text>
                  <Text dimColor>{textBar(used, barCells)[1]}</Text>
                </Text>
              )}
              <Text size="caption" tabular>
                {r.used ?? '–'}%
              </Text>
              {r.resetsAt !== undefined && (
                <Text dimColor size="caption" tabular>
                  ↻ {formatTime(r.resetsAt, at, settings.hour12)}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )

    return below.type === 'engine' ? (
      gauge
    ) : (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center">
        {gauge}
        {below}
      </Box>
    )
  })
}
