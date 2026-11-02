// Pure logic shared by the page script and the tests: reading usage, alerts, time format.
;(function (root) {
  'use strict'

  const WINDOWS = [
    { kind: 'five_hour', name: 'Session' },
    { kind: 'seven_day', name: 'Weekly' },
  ]
  const WARN_AT = 80
  const LAST_ALERT = 95

  // claude.ai answers `{ five_hour: { utilization, resets_at }, seven_day: {...}, ... }`, utilization in percent.
  function parseUsage(body) {
    if (typeof body !== 'object' || body === null) return []
    return WINDOWS.flatMap(({ kind }) => {
      const w = body[kind]
      if (typeof w !== 'object' || w === null) return []
      if (typeof w.utilization !== 'number' || !Number.isFinite(w.utilization)) return []
      const reset =
        typeof w.resets_at === 'string' ? Date.parse(w.resets_at) : typeof w.resets_at === 'number' ? w.resets_at * 1000 : NaN
      return [{ kind, percentUsed: w.utilization, ...(Number.isNaN(reset) ? {} : { resetsAt: reset }) }]
    })
  }

  function readings(limits, at, warnAt = WARN_AT) {
    return WINDOWS.map(({ kind, name }) => {
      const l = limits.find(x => x.kind === kind)
      if (!l) return { kind, name, isHigh: false }
      // A window whose reset time has passed starts over at zero.
      if (l.resetsAt !== undefined && l.resetsAt <= at) return { kind, name, used: 0, isHigh: false }
      const used = Math.max(0, Math.min(100, Math.round(l.percentUsed)))
      return { kind, name, used, isHigh: used >= warnAt, resetsAt: l.resetsAt }
    })
  }

  // The thresholds a window has crossed that were not alerted yet, highest last.
  function dueAlerts(used, alreadyAlerted, warnAt = WARN_AT) {
    return [...new Set([warnAt, LAST_ALERT])].sort((a, b) => a - b).filter(t => used >= t && t > alreadyAlerted)
  }

  // "20:00" when the moment is today, else "7 Nov, 20:00", in the person's locale, 24-hour.
  function formatTime(when, at) {
    const date = new Date(when)
    const isToday = date.toDateString() === new Date(at).toDateString()
    const time = { hour: '2-digit', minute: '2-digit', hour12: false }
    return new Intl.DateTimeFormat(undefined, isToday ? time : { ...time, day: 'numeric', month: 'short' }).format(date)
  }

  // The organization whose usage to show: the one claude.ai last had open, else the first that can chat.
  function pickOrg(orgs, lastActive) {
    if (!Array.isArray(orgs) || orgs.length === 0) return undefined
    const byId = orgs.find(o => o && o.uuid === lastActive)
    if (byId) return byId.uuid
    const chat = orgs.find(o => o && Array.isArray(o.capabilities) && o.capabilities.includes('chat'))
    return (chat || orgs[0]).uuid
  }

  const api = { WINDOWS, WARN_AT, LAST_ALERT, parseUsage, readings, dueAlerts, formatTime, pickOrg }
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.QuotaGauge = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
