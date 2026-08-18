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

[MIT](LICENSE)# DSH-Agent-switcher
# Agent 切换器（dsh-agent-switcher）

**在 DeepSeek Harness 对话界面中随时切换 Agent（预设）——即使会话已经开始——并让历史消息中的工具调用保持完整可读。**

[English](README.md)

`dsh-agent-switcher` 是 DeepSeek Harness（DSH）的双半区（Host + 浏览器）Cordis 插件。它在对话输入行的工具行里、**模型选择器的左侧**增加一个 **Agent 芯片**，样式与模型选择器完全一致；点开可列出部署提供的全部 Agent 预设，选择后立即重组当前会话的 Agent。

## 为什么需要它

DSH 用 **Agent 预设**（工具行 + 人设 + 技能目录）组装每个会话的 Agent，且预设在设计上**在会话创建时即固化**：一旦对话开始，宿主会拒绝换装（`agent-preset-locked`），因为历史记录是在旧预设的工具下产生的。

本插件在保证安全的前提下让切换成为可能：

- **Host 半区**：在内置 `webServer` 服务上暴露两个 HTTP 路由。`POST /agent-switch` 执行与官方路径完全相同的重链接（`agentPresets.recompose`），只是**不做空白会话门禁**；随后写入官方的 `agent-preset/selected` 会话事件，让会话列表、头部标签、浏览器各界面通过既有的事件转发链自动同步，无需自定义事件白名单。
- **Client 半区**：输入行芯片 UI + **历史工具调用兼容视图**。切换后，会把该会话历史上出现过的每个工具名注册为 `tool.call.toolview` 兼容卡片——参数、结果、错误状态完整展示，不会降级成不可读。已有官方全局卡片的工具名绝不被遮蔽，DSH 内置的 `GenericToolCard` 仍是最后兜底。

## 功能特性

- **输入行芯片**，位于模型选择器左侧，外观一致（28px 胶囊、主题令牌、旋转箭头、弹出菜单）。
- **空白会话即时切换**；**已开始会话确认后强制切换**（菜单内联确认条）。
- **历史无缝可读**：官方工具视图原样保留；无官方视图的旧工具显示兼容卡片（参数 + 结果 + 错误态 + 「兼容视图」徽标）。
- **状态实时同步**：芯片、会话头部标签、会话列表均通过官方 `agent-preset/selected` 事件更新。
- **并发安全**：同一会话的切换请求按序串行（与官方 api-proxy 队列一致）。
- **自清理**：名单在设置变更与连接重置时自动刷新；兼容注册随插件生命周期卸载。

## 环境要求

- DeepSeek Harness（Web profile），已在 `0.1.0-rc.6` 上验证
- Node.js >= 22.10（DSH 自身要求）
- 无需 npm install：宿主 loader 直接从本地目录加载

## 安装（其他电脑）

loader 以**标准 ESM 语义**解析插件包，这排除了两种看似自然的写法：

- **目录路径**（`./plugins/dsh-agent-switcher`）会失败——Node ESM 无法导入目录；
- 指向**入口文件**的路径能让 Host 半区工作，但会丢失 Client 半区——浏览器模块系统通过解析 `<name>/package.json` 并读取 `dsh.client` 声明来发现客户端 bundle。

因此 patch 的 `name` 必须是**裸包名** `dsh-agent-switcher`，且包必须能被 **profile 自身的 `node_modules` 链**（`~/.dsh/profiles/<profile>/node_modules`）解析——这才是 loader 实际搜索的路径。注意：当 DSH 使用自定义 `--prefix` 安装（常见的 `D:\npm-global`/pnpm 布局）时，npm 全局根**不在**这条解析链上。

### 快速开始（一条命令）

```powershell
# 任意位置克隆仓库后，运行：
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
# 可选参数：-ProfileName web（默认）与 -PluginDir D:\path\to\dsh-agent-switcher
```

脚本会创建**目录联接** `~/.dsh/profiles/web/node_modules/dsh-agent-switcher` → 你的源码目录（单一副本——以后 `git pull` 改动即时生效，无需重装），注册 patch 条目（自动备份），并提示重启。

### 手动安装（即脚本所做的事情）

```powershell
# 1. 把插件源码放到任意位置，例如：
git clone https://github.com/<你的用户名>/dsh-agent-switcher.git D:\dsh-agent-switcher

# 2. 联接到 profile 依赖树（关键步骤——复制也可以，但联接保持源码与安装同步）：
$link = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-agent-switcher"
New-Item -ItemType Junction -Path $link -Target "D:\dsh-agent-switcher"
# macOS/Linux: ln -s /path/to/dsh-agent-switcher ~/.dsh/profiles/web/node_modules/dsh-agent-switcher

# 3. 在 profile 补丁中注册——打开 ~/.dsh/profiles/web/cordis.patch.yml 加入：
```

```yaml
# ── Agent 切换器 ───────────────────────────────────────────────
- insert:
    - id: agent-switcher
      name: dsh-agent-switcher
```

```powershell
# 4. 重启 DSH（完全退出后重新运行）。芯片即出现在每个会话输入行的模型选择器左侧。
```

> `npm install -g` 只有在 npm 全局根**恰好就是** DSH 包树根（即 `@deepseek-ai/dsh`
> 直接位于 `$(npm root -g)` 下）时才有效。自定义 `--prefix` 时全局根不在 loader
> 解析链上——请改用上面的目录联接方式。

## 故障排查

本插件开发过程中真实遇到过的报错与修复对照：

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| `ERR_MODULE_NOT_FOUND: Cannot find module '...plugins\dsh-agent-switcher'`（目录 URL） | patch 的 `name` 指向**目录**；Node ESM 不能导入目录 | 改用裸包名 `dsh-agent-switcher`（见安装章节） |
| `ERR_PACKAGE_PATH_NOT_EXPORTED`（或子路径找不到） | `name` 是带**子路径**的裸包名（`dsh-agent-switcher/lib/index.js`），`exports` 未声明该子路径 | 使用纯裸包名；`exports["."]` 已指向 `lib/index.js` |
| `Cannot find package 'dsh-agent-switcher' imported from ...\profiles\web` | 包不在 **profile 的** node_modules 链上（自定义 `--prefix` 时 npm 全局根不被搜索） | 把包联接到 `~/.dsh/profiles/<profile>/node_modules/`（或复制） |
| 启动报 `client-modules: ... failed to compose` | `exports["./client"]` 对应的 bundle 缺失或格式错误 | 重跑 `node --check lib/client.js`；保留 `window.__ModuleLoader__.load({ id: 'dsh-agent-switcher', ... })` 外壳且 id 一致 |
| Host 路由返回 `404` | 插件根本没加载 | 检查启动日志中的 loader 报错；核对联接目标与 patch 条目 |

## 使用方法

1. 打开任意会话，在模型选择器左侧找到 **Agent 芯片**（如 `标准模式 · Agent`）。
2. 点击展开菜单：列出全部预设（内置 + 本地创作；本地预设标注 `· 本地`；损坏预设禁用并显示原因）。
3. 选择一个预设：
   - **空白会话**（尚未运行任何回合）：立即切换。
   - **已开始会话**：菜单内联确认条提示"历史旧工具调用将改用兼容视图"，确认后强制切换。
4. 芯片标签、会话头部标签、会话列表即时更新；历史工具调用保持可读。

## 工作原理

```
浏览器芯片 ──POST /agent-switch──▶ Host 路由
                                        │  agents.get(sessionId) → 活动 Agent
                                        │  agentPresets.recompose(agent.ctx, 预设)
                                        │  session.append('agent-preset/selected')
                                        ▼
                  转发远程事件 ──▶ 会话列表 / 头部标签 / 芯片同步更新
浏览器芯片 ◀──POST /agent-used-tools── Host 路由（从会话日志取工具名）
        │
        └─ 注册 tool.call.toolview 兼容卡片
```

- **Host 半区**是标准 Cordis 插件（`export const inject` / `export function apply`），依赖 `webServer`、`agentPresets`、`agents` 三个宿主服务；路由为精确路径 `POST` 端点、返回 JSON，并按会话串行化并发切换。
- **Client 半区**是 DSH 客户端模块格式的浏览器 bundle（`window.__ModuleLoader__.load`），除 `react` 外零依赖；使用 `conversation.input.right` 插槽（零替换风险，条目恰好渲染在模型座左侧）、`sessions` 列表 store、`locale` 与 `remote` 事件。
- **历史为何保持可读**：官方工具视图由 UI 包全局注册，常见工具（read/write/bash/grep/…）切换后原样渲染；无官方卡片的工具名由本插件在 root 层注册兼容卡片——若预设层有同名注册则优先于它，`GenericToolCard` 仍是最后的兜底。

## 安全说明

- 路由**仅接受 POST** 并校验 JSON；`webServer` 默认绑定 `127.0.0.1`（回环）。启用本插件期间请勿将 Web profile 绑定到 `0.0.0.0`，否则本机网络的任意调用方都可能触发切换。
- 切换是特权组合操作：只能重链接**已打开的**会话的 Agent，未打开的会话会被拒绝。
- 无遥测、除回环路由外无任何网络请求、无持久化存储。

## 卸载

1. 从 `cordis.patch.yml` 删除 `- insert:` 块（或删除 `agent-switcher` 条目）。
2. 重启 DSH，随后可删除 `plugins/dsh-agent-switcher` 目录。

## 开发

- `lib/index.js` — Host 半区（ESM，零依赖）。
- `lib/client.js` — Client 半区（浏览器 bundle；该文件即源码，无需构建步骤）。
- 语法校验：`node --check lib/index.js` 与 `node --check lib/client.js`。
- 本包的动态插件前身（会话内开发验证的 `agsw-2`）经三轮迭代（空白会话暂存 → 强制重组 → 兼容视图）后固化为本静态形态，设计历程见动态版 git 历史。

## 许可证

[MIT](LICENSE)
