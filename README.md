<div align="center">

# Quota Gauge for Claude Code

**See how much of your Claude plan you've used, right above the prompt.**
No more typing `/usage`, no more surprise "limit reached" in the middle of a task.

[![Check](https://github.com/maxsld/claude-quota-gauge/actions/workflows/check.yml/badge.svg)](https://github.com/maxsld/claude-quota-gauge/actions/workflows/check.yml)
![Version](https://img.shields.io/badge/version-1.2.1-D97757)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.314%2B-D97757)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<img src="docs/preview.svg" alt="Quota Gauge in the Claude Code panel: a Session bar at 44% resetting at 20:00 and a Weekly bar at 7% resetting on 7 Nov, right above the prompt box" width="760">

</div>

## Features

- **Session and weekly bars.** Your rolling 5-hour window and your 7-day window, as percent used, right above the prompt box.
- **Reset times.** `↻ 20:00` when it resets today, `↻ 7 Nov, 01:00` otherwise, in your own locale.
- **Alerts.** A notification when a window reaches your warning level (80% by default) and again at 95%. Each alert fires once per window.
- **Red when it matters.** Bars are Claude orange and turn red past your warning level.
- **Works everywhere.** In the Claude Code VS Code extension, the terminal, and the **Code** tab of the Claude desktop app.
- **Instant.** The bars are there as soon as you open Claude Code, no message needed.
- **Light and private.** No tokens spent, and the plugin never sees your login: Claude Code makes the one request for it.

## Install

Installs once for your user account, so the gauge is there in **every project**, existing and new.

**From a terminal** (one line):

```bash
claude plugin install quota-gauge --marketplace maxsld/claude-quota-gauge --scope user
```

**Or inside Claude Code**, type:

```
/plugin install quota-gauge --marketplace maxsld/claude-quota-gauge
```

Answer `y` to add the marketplace, then keep the **User** scope (the default, press Enter) so it applies to all your projects.

**In the VS Code extension**, if `/plugin` isn't available: click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `maxsld/claude-quota-gauge`, then **Add plugin** and pick the **User** scope.

The gauge appears right away. To get new versions: `/plugin update quota-gauge`.

### Requirements

- **Claude Code 2.1.314** or newer (VS Code extension or CLI)
- A **claude.ai Pro, Max or Ultra** subscription. Usage windows only exist for subscription plans: with an API key there is nothing to show.

## Codex CLI

Codex has no plugin UI to draw bars with, but its footer can show your ChatGPT plan's 5-hour and weekly limits natively (`5h 88% left · weekly 98% left`). One command turns them on:

```bash
curl -fsSL https://raw.githubusercontent.com/maxsld/claude-quota-gauge/main/codex/setup.cjs | node
```

It adds `five-hour-limit` and `weekly-limit` to `[tui] status_line` in `~/.codex/config.toml` (or `$CODEX_HOME`), keeps your other items and settings, saves a `config.toml.bak`, and does nothing if they're already there. Prefer doing it by hand? Type `/statusline` in Codex and tick the same two items.

Codex limits: the figures appear after your first message (they come with the reply), the footer shows percent **left**, and reset times are only in `/status`. No alerts.

## claude.ai in your browser

The same gauge, right above the prompt on **claude.ai**, as a browser extension for Chrome, Edge, Brave or Arc. It reads your usage the way claude.ai's own **Settings → Usage** page does, with your existing session: no login, no token handled, nothing sent anywhere but claude.ai.

1. [Download the repository as a ZIP](https://github.com/maxsld/claude-quota-gauge/archive/refs/heads/main.zip) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. **Load unpacked** → pick the `browser` folder.

Open claude.ai: Session and Weekly bars sit above the prompt box, refreshed every minute and a few seconds after each message, with an alert at 80% and 95%. If claude.ai changes its layout and the prompt box can't be found, the gauge moves to a small pill in the bottom-right corner instead of disappearing.

It relies on claude.ai's internal usage endpoint, which is not a public API: if Anthropic changes it, the bars stay on their last figures until the extension is updated.

## Claude desktop app and ChatGPT

- **Claude desktop app, Code tab:** the Claude Code plugin above works there as is.
- **Claude desktop app, chat:** no extension can draw there. The app is signed, and its only extensions are MCP servers, which can only answer inside a reply. Use claude.ai in your browser with the extension above, or **Settings → Usage**.
- **ChatGPT:** not possible. ChatGPT apps only show inside the conversation and can't read your plan's usage. For Codex, see above or use `/status`.

## Settings

You can set these when you install, and change them any time in `/config` (the **quota-gauge** rows). Changes apply immediately.

| Setting | Default | What it does |
| --- | --- | --- |
| Bars to show | Session and weekly | Show both bars, or only one |
| Warning level (%) | 80 | Bars turn red and the first alert fires at this usage |
| Usage alerts | On | Notify at the warning level and at 95% |
| Time format | 24-hour | 24-hour, 12-hour or your system's format |

## How it works

- **When a session opens**, the plugin asks Anthropic for your account's usage, the same request `/usage` makes, so the bars fill in right away. It goes through Claude Code's own login (`$.session.authorize()`): the plugin never sees your token.
- **After every reply**, Claude Code reports your usage with the response, and the bars follow it live.
- **While you're idle**, usage is read again every 5 minutes, so use from another device or conversation shows up too, and a window that just reset drops back to 0%.
- The last reading is kept locally, so the bars are filled even before the first request answers.

## FAQ

**A bar shows `–%`.**
Its figure hasn't been read yet, usually for a second while the session opens. If it stays, you're probably signed in with an API key rather than a Pro, Max or Ultra plan: usage windows only exist for subscriptions.

**There's a small "From quota-gauge plugin" label above the bars.**
Claude Code adds it to everything a plugin draws, so you always know what's showing what. Plugins can't remove it.

**Does it count only this conversation?**
No. The figures are for your whole Claude account, the same as `/usage`: every conversation, on every device.

**Is my data sent anywhere?**
Nothing leaves your machine except one request to Anthropic's own API (`api.anthropic.com`), the same one `/usage` makes, every 5 minutes at most. It's sent by Claude Code with your existing login; the plugin never handles the token. Nothing is sent anywhere else.

## Uninstall

```
/plugin uninstall quota-gauge
```

## Development

```bash
git clone https://github.com/maxsld/claude-quota-gauge
cd claude-quota-gauge
claude plugin validate .   # manifest and hooks
claude plugin test .       # unit and render tests
claude --plugin-dir .      # try your changes live
```

The plugin is three small files: [hooks/gauge.ts](hooks/gauge.ts) (readings, alerts, time format), [hooks/register.tsx](hooks/register.tsx) (Claude Code hooks and the drawing) and [types/index.d.ts](types/index.d.ts) (the state it keeps). Pull requests are welcome.

## En français

**Quota Gauge** affiche ta consommation Claude (session de 5 h et semaine) juste au-dessus du champ de saisie de Claude Code, avec l'heure de réinitialisation et une alerte à 80 % et 95 %. Installation, une seule fois pour tous tes projets : `claude plugin install quota-gauge --marketplace maxsld/claude-quota-gauge --scope user` dans un terminal, ou `/plugin install quota-gauge --marketplace maxsld/claude-quota-gauge` dans Claude Code (garde la portée **User**). Nécessite un abonnement Pro, Max ou Ultra. Pour Codex CLI, voir la section [Codex CLI](#codex-cli) : une commande active les limites 5 h et semaine natives de Codex dans son pied de page. Pour claude.ai dans le navigateur (Chrome, Edge, Brave, Arc), une extension affiche la même jauge au-dessus du champ de saisie : voir [claude.ai in your browser](#claudeai-in-your-browser). Dans le chat de l'app desktop Claude et dans ChatGPT, impossible : aucune extension ne peut y afficher quoi que ce soit autour du champ de saisie.

## License

[MIT](LICENSE) © Maxens Soldan

<sub>Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.</sub>
