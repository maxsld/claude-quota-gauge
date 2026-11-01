import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RateLimit, Snapshot } from '../types'

const PANE = 'quota-gauge'
const TITLE = 'Claude usage'
const TICK_MS = 60_000
// The last reading, kept across sessions so the gauge shows before the first reply.
const STORE_KEY = 'lastRateLimits'

// Claude's orange, and Apple's system red for a window nearly used up.
const ORANGE = ['#F0A07E', '#D97757']
const RED = ['#FF7A70', '#E5484D']
const HIGH_USED = 85

const WINDOWS = [
  { kind: 'five_hour', name: 'Session', span: '5 h' },
  { kind: 'seven_day', name: 'Weekly', span: '7 days' },
]

const snapshot = atom({ plugin: 'quota-gauge', key: 'snapshot' } as const, null)
// Bumped every minute so the reset countdowns redraw while the session is idle.
const now = atom({ plugin: 'quota-gauge', key: 'now' } as const, 0)

type Reading = { name: string; span: string; used: number; resets: string }

function readings(snap: Snapshot, at: number): Reading[] {
  return WINDOWS.flatMap(({ kind, name, span }) => {
    const limit = snap.rateLimits.find(l => l.kind === kind)
    if (!limit) return []
    const resetAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
    // A window whose reset time has passed starts over at zero.
    if (resetAt <= at) return [{ name, span, used: 0, resets: 'Just reset' }]
    const used = Math.min(100, Math.round(limit.percentUsed))
    return [{ name, span, used, resets: Number.isNaN(resetAt) ? '' : `Resets in ${countdown(resetAt - at)}` }]
  })
}

function countdown(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`
  return `${mins} min`
}

function barSvg(used: number): string {
  const [from, to] = used >= HIGH_USED ? RED : ORANGE
  const w = 320
  const h = 8
  const fill = used > 0 ? Math.max(h, (used / 100) * w) : 0
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" rx="${h / 2}" fill="#8E8E93" fill-opacity="0.22"/>` +
    (fill > 0 ? `<rect width="${fill}" height="${h}" rx="${h / 2}" fill="url(#g)"/>` : '') +
    `</svg>`
  )
}

function textBar(used: number, width: number): [string, string] {
  const filled = Math.round((used / 100) * width)
  return ['━'.repeat(filled), '━'.repeat(width - filled)]
}

function statusLine(snap: Snapshot, at: number): string {
  const parts = readings(snap, at).map(r => `${r.name} ${r.used}% used`)
  return parts.length > 0 ? parts.join(' · ') : 'Usage: waiting for the first reply'
}

async function refresh($: EngineInterface) {
  const snap = await read($, snapshot)
  const at = await $.clock.now()
  await update($, now, () => at)
  const panes = await $.ui.panes()
  const isShown = panes.some(p => p.id === PANE && p.isPlaced)
  // The plain status line is only the fallback where the pane can't be drawn.
  $.ui.status(snap && !isShown ? statusLine(snap, at) : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usage-gauge', description: 'Show the Claude usage gauge' })

    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) {
      await update($, snapshot, () => ({
        rateLimits: usage.rateLimits,
        contextPercent: usage.context.percent,
        isStale: false,
      }))
    } else {
      const saved = (await $.store.get(STORE_KEY)) as RateLimit[] | undefined
      await update($, snapshot, () => ({ rateLimits: saved ?? [], isStale: saved !== undefined }))
    }

    await $.ui.open({ id: PANE, title: TITLE, rows: 9 })
    await refresh($)
    $.clock.every(TICK_MS, () => void refresh($))

    return result
  })

  on('command.run', { command: 'usage-gauge' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE, rows: 9 })
    await refresh($)

    return { text: opened.isPlaced ? 'Usage gauge shown.' : 'Usage gauge: no room to draw it here.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) {
      await update($, snapshot, () => ({
        rateLimits: e.rateLimits,
        contextPercent: e.context.percent,
        isStale: false,
      }))
      if (e.changed.includes('rateLimits')) await $.store.set(STORE_KEY, e.rateLimits)
    } else {
      await update($, snapshot, snap => (snap ? { ...snap, contextPercent: e.context.percent } : snap))
    }
    await refresh($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const snap = await read($, snapshot)
    const at = (await read($, now)) || (await $.clock.now())
    const rows = snap ? readings(snap, at) : []

    if (rows.length === 0) {
      return (
        <Box flexDirection="column" gap="xs" padding="sm">
          <Text weight="semibold">Usage</Text>
          <Text dimColor size="footnote">
            Your session and weekly limits appear after Claude's first reply.
          </Text>
        </Box>
      )
    }

    const barCells = Math.max(10, Math.min(36, e.props.bodyColumns - 24))

    return (
      <Box flexDirection="column" gap="md" padding="sm">
        {rows.map(r => (
          <Box key={r.name} flexDirection="column" gap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
              <Text>
                <Text weight="semibold">{r.name}</Text>
                <Text dimColor size="footnote">  {r.span}</Text>
              </Text>
              <Text color={r.used >= HIGH_USED ? 'error' : 'claude'} weight="semibold" tabular>
                {r.used}%<Text dimColor size="footnote" weight="regular"> used</Text>
              </Text>
            </Box>
            {Svg ? (
              <Svg source={barSvg(r.used)} alt={`${r.name}: ${r.used}% used`} height={8} />
            ) : (
              <Text>
                <Text color={r.used >= HIGH_USED ? 'error' : 'claude'}>{textBar(r.used, barCells)[0]}</Text>
                <Text dimColor>{textBar(r.used, barCells)[1]}</Text>
              </Text>
            )}
            <Text dimColor size="caption" tabular>
              {r.resets}
            </Text>
          </Box>
        ))}
        {(snap?.isStale || snap?.contextPercent !== undefined) && (
          <Text dimColor size="caption">
            {snap?.isStale ? 'Last known values · updates after the next reply' : `Context ${snap?.contextPercent}% full`}
          </Text>
        )}
      </Box>
    )
  })
}
