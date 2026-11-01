# Claude Quota Gauge

See how much of your Claude plan you've used, right in Claude Code, without typing `/usage`.

```
Session ━━━━━━━━──────── 44%  ↻ 20:00      Weekly ━━──────────── 7%  ↻ 7 Nov, 01:00
```

- **Session**: your rolling 5-hour window, percent used and when it resets
- **Weekly**: your 7-day window, percent used and when it resets
- Orange bars, turning red past 85% used

Shown right above the prompt box, in the **Claude Code VS Code extension** and in the **terminal CLI**.

## Install

In Claude Code, type:

```
/plugin install quota-gauge --marketplace YOUR_GITHUB_USER/claude-quota-gauge
```

Answer `y` to add the marketplace, then press Enter to install for your user. The gauge appears right away.

In the VS Code extension, if `/plugin` isn't available: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `YOUR_GITHUB_USER/claude-quota-gauge`, then **Add plugin**.

## Requirements

- Claude Code 2.1.314 or newer
- A claude.ai **Pro, Max or Ultra** subscription (API-key users have no 5h/7d limits, so there is nothing to show)

## How it works

Claude Code reports your rate-limit windows with every reply. The plugin reads them through Claude Code's own plugin API (`$.session.usage()` and the `session.measure` event), so it makes **no extra network calls**, reads **no tokens or credentials**, and costs nothing.

- Before your first reply in a new session, it shows the last known values, marked `(last known)`.
- Countdowns refresh every minute, even when you're idle.

## Uninstall

```
/plugin uninstall quota-gauge
```

## License

MIT
