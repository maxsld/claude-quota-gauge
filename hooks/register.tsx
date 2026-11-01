import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RateLimit, Snapshot } from '../types'

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

function barSvg(used: number, w: number): string {
  const [from, to] = used >= HIGH_USED ? RED : ORANGE
  const h = 6
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

async function tick($: EngineInterface) {
  const at = await $.clock.now()
  await update($, now, () => at)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
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

    await tick($)
    $.clock.every(TICK_MS, () => void tick($))

    return result
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
    const rows = snap ? readings(snap, at) : []

    if (rows.length === 0) {
      return (
        <Box paddingX="sm" paddingY="xs">
          <Text dimColor size="caption">
            Session and weekly usage appear after Claude's first reply.
          </Text>
        </Box>
      )
    }

    // Side by side when there is room, stacked in a narrow panel.
    const isRow = e.props.bodyColumns >= 70
    const barCells = Math.max(10, Math.min(36, Math.floor(e.props.bodyColumns / (isRow ? 2 : 1)) - 6))
    const barPx = isRow ? 200 : 260

    return (
      <Box flexDirection={isRow ? 'row' : 'column'} columnGap="xl" rowGap="sm" paddingX="sm" paddingY="xs">
        {rows.map(r => (
          <Box key={r.name} flexDirection="column" gap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end" columnGap="md">
              <Text>
                <Text weight="semibold">{r.name}</Text>
                <Text dimColor size="caption">  {r.span}</Text>
              </Text>
              <Text color={r.used >= HIGH_USED ? 'error' : 'claude'} weight="semibold" tabular>
                {r.used}%<Text dimColor size="caption" weight="regular"> used</Text>
              </Text>
            </Box>
            {Svg ? (
              <Svg source={barSvg(r.used, barPx)} alt={`${r.name}: ${r.used}% used`} width={barPx} height={6} />
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
      </Box>
    )
  })
}
