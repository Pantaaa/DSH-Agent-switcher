# dsh-agent-switcher

**Switch the Agent (preset) of a running DeepSeek Harness session from the composer — even after the conversation has started — with historical tool calls kept fully legible.**

[中文说明](README.zh.md)

`dsh-agent-switcher` is a dual-half Cordis plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). It adds an **Agent chip** to the chat composer tool row, directly left of the model selector, styled identically to it. The chip lists every agent preset the deployment supplies; picking one recomposes the session's agent immediately.

## Why this exists

DSH composes each session's agent from an **agent preset** (tool rows + persona + skills). By design, a preset is fixed at session creation: once a conversation has run, the host refuses to swap compositions (`agent-preset-locked`) because the history was produced under the old preset's tools.

This plugin makes switching possible anyway, safely:

- **Host half** — exposes two HTTP routes on the built-in `webServer` service. `POST /agent-switch` performs the same re-link the official path uses (`agentPresets.recompose`) *without* the blank-session gate, then appends the stock `agent-preset/selected` session event so the session list, header label, and every browser surface follow automatically through the existing forwarded-event chain.
- **Client half** — the composer chip UI plus **historical tool-call compatibility views**: after a switch, every tool name the session ever called is registered as a keyed `tool.call.toolview` card, so old tool calls render with their arguments, result, and error state instead of degrading. Tool names that already have official global cards are never shadowed, and DSH's built-in `GenericToolCard` remains the final fallback.

## Features

- **Chip in the composer row**, left of the model selector, matching its look (28px pill, theme tokens, animated chevron, popup menu).
- **Instant switch on blank sessions**; **confirmed force-switch on started sessions** (inline confirm strip in the menu).
- **Seamless history**: official tool views stay untouched; unknown/legacy tools get a compatibility card with arguments + result + error state + a "compatibility view" badge.
- **Live sync**: the chip label, session header label, and session list all update via the stock `agent-preset/selected` event — no custom event allowlist needed.
- **Per-session serialization** of concurrent switches (mirrors the api-proxy queue).
- **Self-cleaning**: the roster refreshes on settings changes and connection resets; compatibility registrations live and die with the plugin.

## Requirements

- DeepSeek Harness (Web profile) — tested on `0.1.0-rc.6`
- Node.js >= 22.10 (DSH requirement, for the built-in zstd and module loader)
- No npm install needed: the package is loaded from a local directory by the host loader

## Installation

The loader resolves plugin packages with **plain ESM semantics**, which rules out two seemingly natural forms:

- a **directory path** (`./plugins/dsh-agent-switcher`) fails — Node ESM cannot import a directory;
- a path to the **entry file** works for the host half but hides the client half — the browser module system discovers the client bundle by resolving `<name>/package.json` and reading the `dsh.client` declaration.

So the patch `name` must be the **bare package name** `dsh-agent-switcher`, and the package must be resolvable from the **profile's own `node_modules` chain** (`~/.dsh/profiles/<profile>/node_modules`). That chain is what the loader actually searches — the npm global prefix is *not* on it when DSH was installed with a custom `--prefix` (the common `D:\npm-global` / pnpm layout).

### Quick start (one command)

```powershell
# clone the repo anywhere, then:
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
# optional: -ProfileName web (default) and -PluginDir D:\path\to\dsh-agent-switcher
```

The script creates a **directory junction** `~/.dsh/profiles/web/node_modules/dsh-agent-switcher` → your source directory (single copy — later `git pull` edits apply without reinstalling), registers the patch entry (with a backup), and prints the restart reminder.

### Manual install (what the script does)

```powershell
# 1. Put the plugin source anywhere, e.g.
git clone https://github.com/<you>/dsh-agent-switcher.git D:\dsh-agent-switcher

# 2. Junction it into the profile dependency tree (this is the reliable step —
#    a copy works too, but a junction keeps source and install in sync):
$link = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-agent-switcher"
New-Item -ItemType Junction -Path $link -Target "D:\dsh-agent-switcher"
# macOS/Linux: ln -s /path/to/dsh-agent-switcher ~/.dsh/profiles/web/node_modules/dsh-agent-switcher

# 3. Register in the profile patch — open ~/.dsh/profiles/web/cordis.patch.yml and add:
```

```yaml
# ── Agent switcher ───────────────────────────────────────────────
- insert:
    - id: agent-switcher
      name: dsh-agent-switcher
```

```powershell
# 4. Restart DSH (fully quit and relaunch). The chip appears in every
#    session's composer row, left of the model selector.
```

> `npm install -g` only works when the npm global prefix **is** the DSH package
> tree root (i.e. `@deepseek-ai/dsh` sits directly in `$(npm root -g)`). With a
> custom prefix the global root is not on the loader's resolution chain — use
> the junction method above instead.

## Troubleshooting

Real failure modes observed while developing this plugin, with their fixes:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_MODULE_NOT_FOUND: Cannot find module '...plugins\dsh-agent-switcher'` (directory URL) | The patch `name` pointed at a **directory**; Node ESM cannot import directories | Use the bare package name `dsh-agent-switcher` (see Installation) |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` (or subpath not found) | `name` was a bare name with a **subpath** (`dsh-agent-switcher/lib/index.js`) that `exports` does not declare | Use the plain bare name; `exports["."]` already maps to `lib/index.js` |
| `Cannot find package 'dsh-agent-switcher' imported from ...\profiles\web` | Package not on the **profile's** node_modules chain (npm global prefix is not searched with a custom `--prefix`) | Junction (or copy) the package into `~/.dsh/profiles/<profile>/node_modules/` |
| Startup fails with `client-modules: ... failed to compose` | The bundle at `exports["./client"]` is missing or malformed | Re-run `node --check lib/client.js`; keep the `window.__ModuleLoader__.load({ id: 'dsh-agent-switcher', ... })` envelope with the matching `id` |
| Host routes answer `404` | Plugin did not load at all | Check the boot log for the loader error; verify the junction target and patch entry |

## Usage

1. Open any session and find the **Agent chip** (e.g. `标准模式 · Agent`) left of the model selector.
2. Click it — the menu lists every preset (shipped + locally authored; local ones are marked `· 本地`; broken ones are disabled with the reason).
3. Pick a preset:
   - **Blank session** (no turn has run): switches immediately.
   - **Started session**: an inline strip asks for confirmation, noting that historical tool calls switch to compatibility views; confirm to force the switch.
4. The chip label, the session header label, and the session list update instantly. Old tool calls remain readable.

## How it works

```
browser chip ──POST /agent-switch──▶ host route
                                        │  agents.get(sessionId) → live agent
                                        │  agentPresets.recompose(agent.ctx, preset)
                                        │  session.append('agent-preset/selected')
                                        ▼
                 forwarded remote event ──▶ session list / header / chip update
browser chip ◀──POST /agent-used-tools── host route (tool names from session log)
        │
        └─ registers keyed tool.call.toolview compatibility cards
```

- The **host half** is a plain Cordis plugin (`export const inject` / `export function apply`) registered on the `webServer`, `agentPresets`, and `agents` services. Routes are exact-path `POST` endpoints that return JSON; per-session switch queues serialize concurrent requests.
- The **client half** is a browser bundle in the DSH client module format (`window.__ModuleLoader__.load`), dependency-free apart from `react`. It consumes `conversation.input.right` (zero replacement risk — entries render immediately left of the model seat), the `sessions` list store, `locale`, and `remote` events.
- **Why history stays legible**: official tool views are registered globally by the UI packages, so common tools (read/write/bash/grep/…) render unchanged after a switch. For tool names without an official card, the plugin registers compatibility cards on the root layer — preset-layer registrations, if any, shadow them, and `GenericToolCard` remains the last-resort fallback.

## Security notes

- The HTTP routes accept **POST only** and validate JSON payloads; the `webServer` default bind is `127.0.0.1` (loopback). Do not bind the Web profile to `0.0.0.0` while this plugin is enabled, or any local network caller could trigger agent switches.
- Switching is a privileged composition action: only the session's live agent can be re-linked, and a session that is not open is refused.
- No telemetry, no network calls beyond the loopback routes, no storage.

## Uninstall

1. Remove the `- insert:` block from `cordis.patch.yml` (or delete the `agent-switcher` entry).
2. Restart DSH. You may then delete the `plugins/dsh-agent-switcher` directory.

## Development

- `lib/index.js` — host half (ESM, zero dependencies).
- `lib/client.js` — client half (browser bundle; the file is the source — no build step).
- Validate syntax: `node --check lib/index.js` and `node --check lib/client.js`.
- The dynamic-plugin ancestor of this package (developed and validated in-session as `agsw-2`) was promoted to this static form; see the git history of the dynamic version for the design iterations (blank-session staging → force recompose → compatibility views).

## License

[MIT](LICENSE)