import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

// The windows Claude Code reports for Pro / Max subscriptions, in display order.
const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const BAR_WIDTH = 8
const TICK_MS = 60_000
// The last reading, kept across sessions so the gauge shows before the first reply.
const STORE_KEY = 'lastRateLimits'

type Snapshot = { rateLimits: SessionRateLimit[]; contextPercent?: number }

function bar(percentLeft: number): string {
  const filled = Math.round((percentLeft / 100) * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return 'reset'
  const minutes = Math.round(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d${String(hours).padStart(2, '0')}h`
  if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}`
  return `${mins}m`
}

function format(snapshot: Snapshot, now: number, isStale: boolean): string {
  const parts: string[] = []

  for (const [kind, label] of Object.entries(WINDOWS)) {
    const limit = snapshot.rateLimits.find(l => l.kind === kind)
    if (!limit) continue
    // A window whose reset time has passed is fully available again.
    const hasReset = limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now
    const left = hasReset ? 100 : Math.max(0, Math.round(100 - limit.percentUsed))
    const reset = hasReset ? '' : ` · ↻ ${untilReset(limit.resetsAt, now)}`
    const warn = left <= 10 ? ' ⚠' : ''
    parts.push(`${label} ${bar(left)} ${left}% left${reset}${warn}`)
  }

  if (parts.length === 0) return 'Quota: waiting for the first reply…'
  if (snapshot.contextPercent !== undefined) parts.push(`ctx ${snapshot.contextPercent}%`)

  return (isStale ? '(last known) ' : '') + parts.join('  │  ')
}

let snapshot: Snapshot | undefined
let isStale = false

async function show($: EngineInterface) {
  if (!snapshot) return
  $.ui.status(format(snapshot, await $.clock.now(), isStale))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()

    if (usage.rateLimits.length > 0) {
      snapshot = { rateLimits: usage.rateLimits, contextPercent: usage.context.percent }
    } else {
      const saved = (await $.store.get(STORE_KEY)) as SessionRateLimit[] | undefined
      snapshot = { rateLimits: saved ?? [] }
      isStale = saved !== undefined
    }
    await show($)

    // Keeps the reset countdowns current while the session is idle.
    $.clock.every(TICK_MS, () => void show($))

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) {
      snapshot = { rateLimits: e.rateLimits, contextPercent: e.context.percent }
      isStale = false
      if (e.changed.includes('rateLimits')) await $.store.set(STORE_KEY, e.rateLimits)
    } else if (snapshot) {
      snapshot = { ...snapshot, contextPercent: e.context.percent }
    }
    await show($)

    return next(e)
  })
}
