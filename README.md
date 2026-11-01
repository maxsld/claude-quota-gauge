# Claude Quota Gauge

See how much of your Claude plan you have left, right under the prompt box, without typing `/usage`.

```
5h ███░░░░░ 38% left · ↻ 2h14  │  7d ██████░░ 81% left · ↻ 3d05h  │  ctx 34%
```

- **5h**: your rolling 5-hour session window, percent left and time until it resets
- **7d**: your weekly window, percent left and time until it resets
- **ctx**: how full the current conversation's context window is
- A ⚠ appears when a window drops to 10% or less

Works in the **Claude Code VS Code extension** (under the input box) and in the **terminal CLI**.

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
