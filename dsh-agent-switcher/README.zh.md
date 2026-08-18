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