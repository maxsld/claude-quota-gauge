// Draws the gauge right above the claude.ai prompt box and keeps it current.
;(function () {
  'use strict'
  const { parseUsage, readings, dueAlerts, formatTime, pickOrg } = globalThis.QuotaGauge

  const REFRESH_MS = 60_000
  const ORANGE = '#D97757'
  const RED = '#E5484D'

  let limits = []
  let orgId

  // An overlay in its own shadow root: claude.ai's React tree and styles are never touched.
  const host = document.createElement('div')
  host.id = 'quota-gauge-for-claude'
  host.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;'
  const shadow = host.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .row { display:flex; flex-wrap:wrap; gap:4px 22px; align-items:center; padding:0 10px;
             font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .w { display:flex; align-items:center; gap:7px; white-space:nowrap; }
      .dim { opacity:.6; }
      .num { font-variant-numeric: tabular-nums; }
      .track { width:110px; height:5px; border-radius:3px; background:rgba(142,142,147,.22); overflow:hidden; }
      .fill { height:100%; border-radius:3px; }
      .pill { padding:4px 10px; border-radius:999px; background:var(--bg); box-shadow:0 1px 4px rgba(0,0,0,.15); }
    </style>
    <div class="row"></div>`
  const row = shadow.querySelector('.row')
  document.documentElement.appendChild(host)

  function composer() {
    const input = document.querySelector('div[contenteditable="true"]')
    if (!input) return undefined
    // The bordered box around the input: the fieldset claude.ai wraps it in, else a few levels up.
    return input.closest('fieldset') || input.parentElement?.parentElement?.parentElement || input
  }

  function render() {
    const at = Date.now()
    row.textContent = ''
    for (const r of readings(limits, at)) {
      const w = document.createElement('div')
      w.className = 'w'
      const used = r.used ?? 0
      w.innerHTML =
        `<span class="dim"></span><div class="track"><div class="fill"></div></div>` +
        `<span class="num"></span><span class="dim num"></span>`
      const [name, , num, reset] = w.children
      name.textContent = r.name
      const fill = w.querySelector('.fill')
      fill.style.width = used > 0 ? `max(5px, ${used}%)` : '0'
      fill.style.background = r.isHigh ? RED : ORANGE
      num.textContent = `${r.used ?? '–'}%`
      reset.textContent = r.resetsAt !== undefined ? `↻ ${formatTime(r.resetsAt, at)}` : ''
      row.appendChild(w)
    }
    place()
  }

  function place() {
    const box = composer()
    if (box) {
      const rect = box.getBoundingClientRect()
      if (rect.width > 0) {
        const style = getComputedStyle(box)
        row.classList.remove('pill')
        host.style.color = style.color
        host.style.left = `${rect.left}px`
        host.style.width = `${rect.width}px`
        host.style.top = ''
        host.style.bottom = `${window.innerHeight - rect.top + 6}px`
        host.style.right = ''
        host.style.display = 'block'
        return
      }
    }
    // No prompt box found (another page, or claude.ai changed its layout): a small pill in the corner.
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    row.classList.add('pill')
    row.style.setProperty('--bg', dark ? '#262624' : '#FAF9F5')
    host.style.color = dark ? '#E8E6DC' : '#1F1E1D'
    host.style.left = ''
    host.style.width = ''
    host.style.top = ''
    host.style.right = '16px'
    host.style.bottom = '16px'
    host.style.display = 'block'
  }

  async function getJson(path) {
    const response = await fetch(path, { credentials: 'include', headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`${path}: ${response.status}`)
    return response.json()
  }

  function lastActiveOrg() {
    return document.cookie.split('; ').find(c => c.startsWith('lastActiveOrg='))?.split('=')[1]
  }

  async function refresh() {
    try {
      if (!orgId || orgId !== (lastActiveOrg() ?? orgId)) orgId = pickOrg(await getJson('/api/organizations'), lastActiveOrg())
      if (!orgId) return
      const fresh = parseUsage(await getJson(`/api/organizations/${orgId}/usage`))
      if (fresh.length === 0) return
      limits = fresh
      chrome.storage.local.set({ limits })
      render()
      await alert()
    } catch {
      // Signed out, offline, or the endpoint moved: keep the last figures.
    }
  }

  async function alert() {
    const at = Date.now()
    const { alerted = {} } = await chrome.storage.local.get('alerted')
    const kept = Object.fromEntries(Object.entries(alerted).filter(([k]) => Number(k.split('@')[1]) > at))
    for (const r of readings(limits, at)) {
      if (r.used === undefined || r.resetsAt === undefined) continue
      const key = `${r.kind}@${r.resetsAt}`
      const top = dueAlerts(r.used, kept[key] ?? 0).at(-1)
      if (top === undefined) continue
      kept[key] = top
      chrome.runtime.sendMessage({
        type: 'quota-gauge-alert',
        text: `${r.name} usage at ${r.used}% · resets ${formatTime(r.resetsAt, at)}`,
      })
    }
    await chrome.storage.local.set({ alerted: kept })
  }

  // The last figures first, so the bars show at once; fresh ones follow.
  chrome.storage.local.get('limits').then(({ limits: saved }) => {
    if (Array.isArray(saved) && limits.length === 0) limits = saved
    render()
  })
  refresh()
  setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS)
  setInterval(render, 30_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh())
  window.addEventListener('resize', place)
  // claude.ai re-renders and moves the prompt box (new chat, sidebar, long drafts): follow it.
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      place()
    })
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
  // After each reply the figures move: refresh a few seconds after a message is sent.
  document.addEventListener(
    'keydown',
    e => e.key === 'Enter' && !e.shiftKey && e.target?.isContentEditable && setTimeout(refresh, 8000),
    true,
  )
})()
