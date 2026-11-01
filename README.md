<div align="center">

# Quota Gauge for Claude Code

**See how much of your Claude plan you've used, right above the prompt.**
No more typing `/usage`, no more surprise "limit reached" in the middle of a task.

[![Check](https://github.com/OWNER/claude-quota-gauge/actions/workflows/check.yml/badge.svg)](https://github.com/OWNER/claude-quota-gauge/actions/workflows/check.yml)
![Version](https://img.shields.io/badge/version-1.0.0-D97757)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.314%2B-D97757)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<img src="docs/preview.svg" alt="Quota Gauge in the Claude Code panel: a Session bar at 44% resetting at 20:00 and a Weekly bar at 7% resetting on 7 Nov, right above the prompt box" width="760">

</div>

## Features

- **Session and weekly bars.** Your rolling 5-hour window and your 7-day window, as percent used, right above the prompt box.
- **Reset times.** `↻ 20:00` when it resets today, `↻ 7 Nov, 01:00` otherwise, in your own locale.
- **Usage pace.** At your current rate, will you run out before the reset? If so, you'll see `⚠ full ~18:40`, so you can slow down or plan around it.
- **Alerts.** A notification when a window reaches your warning level (80% by default) and again at 95%. Each alert fires once per window.
- **Red when it matters.** Bars are Claude orange and turn red past your warning level.
- **Works everywhere.** In the Claude Code VS Code extension and in the terminal.
- **Zero overhead.** No extra network calls, no tokens, no credentials read. It uses the figures Claude Code already receives with each reply.

## Install

In Claude Code, type:

```
/plugin install quota-gauge --marketplace OWNER/claude-quota-gauge
```

Answer `y` to add the marketplace, then press Enter to install for your user. The gauge appears right away, and in every session after.

In the VS Code extension, if `/plugin` isn't available: click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `OWNER/claude-quota-gauge`, then **Add plugin**.

### Requirements

- **Claude Code 2.1.314** or newer (VS Code extension or CLI)
- A **claude.ai Pro, Max or Ultra** subscription. Usage windows only exist for subscription plans: with an API key there is nothing to show.

## Settings

You can set these when you install, and change them any time in `/config` (the **quota-gauge** rows). Changes apply immediately.

| Setting | Default | What it does |
| --- | --- | --- |
| Bars to show | Session and weekly | Show both bars, or only one |
| Warning level (%) | 80 | Bars turn red and the first alert fires at this usage |
| Usage alerts | On | Notify at the warning level and at 95% |
| Usage pace | On | Show `⚠ full ~HH:MM` when you'd run out before the reset |
| Time format | System | System, 24-hour or 12-hour |

## How it works

Claude Code reports your rate-limit windows with every reply from Claude. The plugin reads them through Claude Code's plugin API and draws them in the band above the prompt.

- Before Claude's first reply in a new session, the last known values are shown, so the gauge is never empty for long.
- Reset times and pace refresh every minute, even when you're idle.
- **Pace** compares how much of the window you've used with how much time has passed since it opened, and projects that rate forward. It only shows up once there's enough history (10% used, 5% of the window elapsed), so it doesn't cry wolf after one big request.

## FAQ

**The gauge says "appear after Claude's first reply".**
Claude Code only learns your usage when Claude answers. Send any message and the bars appear.

**There's a small "From quota-gauge plugin" label above the bars.**
Claude Code adds it to everything a plugin draws, so you always know what's showing what. Plugins can't remove it.

**Does it count only this conversation?**
No. The figures are for your whole Claude account, the same as `/usage`: every conversation, on every device.

**Is my data sent anywhere?**
No. The plugin makes no network calls. The last reading is kept locally so the gauge can show it when a new session starts.

## Uninstall

```
/plugin uninstall quota-gauge
```

## Development

```bash
git clone https://github.com/OWNER/claude-quota-gauge
cd claude-quota-gauge
claude plugin validate .   # manifest and hooks
claude plugin test .       # unit and render tests
claude --plugin-dir .      # try your changes live
```

The plugin is three small files: [hooks/gauge.ts](hooks/gauge.ts) (readings, pace, alerts, time format), [hooks/register.tsx](hooks/register.tsx) (Claude Code hooks and the drawing) and [types/index.d.ts](types/index.d.ts) (the state it keeps). Pull requests are welcome.

## En français

**Quota Gauge** affiche ta consommation Claude (session de 5 h et semaine) juste au-dessus du champ de saisie de Claude Code, avec l'heure de réinitialisation, une alerte à 80 % et 95 %, et une estimation de l'heure à laquelle tu atteindras la limite à ton rythme actuel. Installation : tape `/plugin install quota-gauge --marketplace OWNER/claude-quota-gauge` dans Claude Code. Nécessite un abonnement Pro, Max ou Ultra.

## License

[MIT](LICENSE) © Maxens Soldan

<sub>Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.</sub>
