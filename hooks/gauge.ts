import type { PluginOptions } from 'claude-code'

import type { RateLimit } from '../types'

export type Settings = {
  kinds: string[]
  alerts: boolean
  warnAt: number
  hour12: boolean | undefined
}

export type Reading = {
  kind: string
  name: string
  // Undefined until a figure for the window has been read.
  used?: number
  isHigh: boolean
  resetsAt?: number
}

const WINDOWS = [
  { kind: 'five_hour', name: 'Session' },
  { kind: 'seven_day', name: 'Weekly' },
]

export const LAST_ALERT = 95

export function settingsFrom(options: PluginOptions): Settings {
  const show = String(options.show ?? 'Session and weekly')
  const warnAt = Number(options.warnAt ?? 80)
  const timeFormat = String(options.timeFormat ?? '24-hour')
  return {
    kinds:
      show === 'Session only' ? ['five_hour'] : show === 'Weekly only' ? ['seven_day'] : ['five_hour', 'seven_day'],
    alerts: options.alerts !== false,
    warnAt: Number.isFinite(warnAt) ? Math.min(99, Math.max(1, warnAt)) : 80,
    hour12: timeFormat === '12-hour' ? true : timeFormat === '24-hour' ? false : undefined,
  }
}

export function readings(rateLimits: readonly RateLimit[], at: number, settings: Settings): Reading[] {
  return WINDOWS.flatMap(({ kind, name }): Reading[] => {
    if (!settings.kinds.includes(kind)) return []
    const limit = rateLimits.find(l => l.kind === kind)
    // Every chosen bar always shows, empty until its figure is known.
    if (!limit) return [{ kind, name, isHigh: false }]
    const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : undefined
    // A window whose reset time has passed starts over at zero.
    if (resetsAt !== undefined && resetsAt <= at) return [{ kind, name, used: 0, isHigh: false }]
    const used = Math.min(100, Math.round(limit.percentUsed))
    return [{ kind, name, used, isHigh: used >= settings.warnAt, resetsAt }]
  })
}

// Newer readings replace older ones window by window; a window absent from the update keeps its last figure.
export function merge(older: readonly RateLimit[], newer: readonly RateLimit[]): RateLimit[] {
  const kinds = new Set(newer.map(l => l.kind))
  return [...older.filter(l => !kinds.has(l.kind)), ...newer]
}

// The account's usage as /api/oauth/usage answers it: `{ five_hour: { utilization, resets_at }, ... }`, utilization in percent.
export function parseUsage(body: unknown): RateLimit[] {
  if (typeof body !== 'object' || body === null) return []
  return WINDOWS.flatMap(({ kind }): RateLimit[] => {
    const window = (body as Record<string, unknown>)[kind]
    if (typeof window !== 'object' || window === null) return []
    const { utilization, resets_at: resetsAt } = window as { utilization?: unknown; resets_at?: unknown }
    if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return []
    const reset =
      typeof resetsAt === 'string' ? Date.parse(resetsAt) : typeof resetsAt === 'number' ? resetsAt * 1000 : NaN
    return [
      {
        kind,
        percentUsed: Math.round(utilization * 10) / 10,
        ...(Number.isNaN(reset) ? {} : { resetsAt: new Date(reset).toISOString() }),
      },
    ]
  })
}

// The thresholds a window has crossed that were not alerted yet, highest last.
export function dueAlerts(used: number, alreadyAlerted: number, warnAt: number): number[] {
  return [...new Set([warnAt, LAST_ALERT])]
    .sort((a, b) => a - b)
    .filter(t => used >= t && t > alreadyAlerted)
}

// "20:00" when the moment is today, else "7 Nov, 20:00", in the person's locale.
export function formatTime(when: number, at: number, hour12: boolean | undefined): string {
  const date = new Date(when)
  const isToday = date.toDateString() === new Date(at).toDateString()
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12 }
  try {
    return new Intl.DateTimeFormat(undefined, isToday ? time : { ...time, day: 'numeric', month: 'short' }).format(date)
  } catch {
    const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return isToday ? hm : `${date.getDate()}/${date.getMonth() + 1} ${hm}`
  }
}
