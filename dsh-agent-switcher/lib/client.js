/**
 * dsh-agent-switcher — Client half (browser bundle).
 *
 * Compiled-free bundle in the DSH client module format:
 *   window.__ModuleLoader__.load({ id, factory }) registers the module;
 *   the factory materializes on first require (memoized). The only module
 *   dependency is React, resolved from the shell's static registry.
 *
 * UI: a chip in the composer tool row (conversation.input.right), styled
 * exactly like the model selector, immediately left of the model seat.
 * Behavior:
 *   - blank session: picking a preset recomposes immediately;
 *   - started session: picking shows an inline confirm strip, then forces the
 *     switch through POST /agent-switch;
 *   - after any switch, historical tool names are collected via
 *     POST /agent-used-tools and registered as keyed tool.call.toolview
 *     compatibility cards, so old tool calls stay fully legible.
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-switcher',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var NS = 'agentSwitcher'

    var zh = {
      'chip.caption': 'Agent',
      'chip.fallback': '默认 Agent',
      'menu.aria': '切换 Agent',
      'menu.locked': '切换将替换当前会话的 Agent 组成；历史消息中的旧工具调用会自动改用兼容视图展示。',
      'menu.confirmTitle': '切换为「{name}」？',
      'menu.confirm': '确认切换',
      'menu.cancel': '取消',
      'menu.userTrust': '本地',
      'menu.broken': '加载失败：{reason}',
      'error.load': 'Agent 列表加载失败：{message}',
      'error.apply': '切换失败：{message}',
      'compat.badge': '兼容视图',
      'compat.args': '参数',
      'compat.result': '结果',
      'compat.error': '错误输出',
      'compat.running': '运行中…',
      'compat.toolFrom': '此工具来自切换前的 Agent 预设',
      'preset.standard': '标准模式',
      'preset.code': 'PTC 模式',
      'preset.minimal': '极简模式',
      'preset.cordis': '创造模式'
    }
    var en = {
      'chip.caption': 'Agent',
      'chip.fallback': 'Default agent',
      'menu.aria': 'Switch agent',
      'menu.locked': 'Switching replaces this session\'s agent composition; historical tool calls from the old agent render through a compatibility view.',
      'menu.confirmTitle': 'Switch to \u201C{name}\u201D?',
      'menu.confirm': 'Switch now',
      'menu.cancel': 'Cancel',
      'menu.userTrust': 'Custom',
      'menu.broken': 'Failed to load: {reason}',
      'error.load': 'Failed to load agents: {message}',
      'error.apply': 'Switch failed: {message}',
      'compat.badge': 'Compatibility view',
      'compat.args': 'Arguments',
      'compat.result': 'Result',
      'compat.error': 'Error output',
      'compat.running': 'Running\u2026',
      'compat.toolFrom': 'This tool came from the agent preset active before the switch',
      'preset.standard': 'Standard mode',
      'preset.code': 'Code mode',
      'preset.minimal': 'Minimal mode',
      'preset.cordis': 'Creator mode'
    }

    var BUILT_IN = { standard: 'preset.standard', code: 'preset.code', minimal: 'preset.minimal', cordis: 'preset.cordis' }

    // Tool names that already have a decent global card (keyed registrations
    // in ui-tool / ui-cordis / ui-skill, plus every name GenericToolCard
    // classifies into a rich variant). Never shadowed by the compat view - a
    // same-scope keyed registration would replace them.
    var KNOWN_VIEWS = new Set([
      'ask_user_question', 'bash', 'pwsh', 'edit', 'write', 'read', 'grep', 'glob',
      'todo_write', 'web_search', 'web_fetch', 'run_code',
      'cordis_package_inspect', 'cordis_runtime_inspect', 'cordis_define', 'cordis_run',
      'cordis_stop', 'cordis_undefine', 'skill', 'deliverables'
    ])

    var CSS = '.asw_root{min-width:0;position:relative}' +
      '.asw_trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}' +
      '.asw_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}' +
      '.asw_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}' +
      '.asw_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
      '.asw_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}' +
      '.asw_triggerCaption{color:var(--dsw-alias-label-caption);flex:none}' +
      '.asw_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}' +
      '.asw_chevronOpen{transform:rotate(180deg)}' +
      '.asw_menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:min(260px,100vw - 32px);max-height:min(380px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}' +
      '.asw_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}' +
      '.asw_hint{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label);border-radius:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px}' +
      '.asw_confirm{background:var(--dsw-alias-bg-module-platform);border-radius:8px;flex-direction:column;gap:4px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}' +
      '.asw_confirmTitle{color:var(--dsw-alias-label-primary);font-weight:500}' +
      '.asw_confirmBody{color:var(--dsw-alias-state-warn-label)}' +
      '.asw_confirmActions{align-items:center;gap:8px;display:flex}' +
      '.asw_confirmAction{color:var(--dsw-alias-state-info-primary);font:inherit;cursor:pointer;background:0 0;border:none;padding:0;font-weight:500}' +
      '.asw_confirmCancel{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:none;padding:0}' +
      '.asw_list{overflow-y:auto}' +
      '.asw_option{border:none;background:0 0;color:inherit;font:inherit;text-align:start;width:100%;cursor:pointer;border-radius:8px;align-items:flex-start;gap:8px;padding:7px 8px;display:flex}' +
      '.asw_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}' +
      '.asw_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
      '.asw_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}' +
      '.asw_optionName{font-size:13px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.asw_optionDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.asw_check{color:var(--dsw-alias-state-info-primary);flex:none;margin-top:2px;display:flex}' +
      '.ct_root{flex-direction:column;gap:4px;padding:8px 0;display:flex}' +
      '.ct_head{align-items:center;gap:6px;display:flex}' +
      '.ct_name{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}' +
      '.ct_badge{color:var(--dsw-alias-label-caption);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;flex:none;padding:0 4px;font-size:11px;line-height:16px}' +
      '.ct_section{flex-direction:column;gap:2px;display:flex}' +
      '.ct_label{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}' +
      '.ct_code{background:var(--dsw-alias-markdown-code-block);font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;border-radius:8px;margin:0;padding:8px 10px;font-size:12px;line-height:18px;max-height:220px;overflow-y:auto}' +
      '.ct_code[data-error]{color:var(--dsw-alias-state-error-primary)}' +
      '.ct_running{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}'

    var CSS_ID = 'dsh-agent-switcher/client.css'
    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') !== null) return
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-agent-switcher'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // Static-plugin RPC: the host half exposes these as exact webServer routes.
    function callHost(path, payload) {
      return fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
    }

    function apply(ctx) {
      ensureStyle()
      var api = ctx.connection.api
      var sessions = ctx.sessions
      var t = ctx.locale.bind(NS)

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh, en })
      }, 'dsh-agent-switcher: dicts')

      function displayName(option) {
        if (option === undefined) return ''
        var key = option.trust === 'system' ? BUILT_IN[option.id] : undefined
        return key !== undefined ? t(key) : (option.name !== undefined ? option.name : option.id)
      }
      function messageOf(error) {
        return error !== null && error !== undefined && error.message !== undefined ? error.message : String(error)
      }

      // observable store (immutable snapshots for useSyncExternalStore)
      var snapshot = { options: [], error: null, busy: false }
      var listeners = new Set()
      function set(patch) {
        snapshot = Object.assign({}, snapshot, patch)
        for (var fn of listeners) fn()
      }
      var store = {
        getSnapshot: function () { return snapshot },
        subscribe: function (fn) {
          listeners.add(fn)
          return function () { listeners.delete(fn) }
        },
      }

      function load() {
        return api.agentPresets.list({}).then(function (resp) {
          var result = resp.result
          if (!result.ok) {
            set({ error: t('error.load', { message: result.error.message }) })
            return
          }
          set({ options: result.value.presets, error: null })
        }).catch(function (error) {
          set({ error: t('error.load', { message: messageOf(error) }) })
        })
      }

      // ── compatibility views for tools of a previous agent ──
      var compatRegistered = new Set()
      function registerCompat(toolName) {
        if (compatRegistered.has(toolName) || KNOWN_VIEWS.has(toolName)) return
        compatRegistered.add(toolName)
        ctx.slots.inject('tool.call.toolview', function () {
          return ctx.slots.register({
            name: 'tool.call.toolview',
            key: toolName,
            locale: NS,
          }, CompatToolCard)
        })
      }
      function reconcileCompat(sessionId) {
        if (typeof sessionId !== 'string') return Promise.resolve()
        return callHost('/agent-used-tools', { sessionId }).then(function (reply) {
          if (reply === null || typeof reply !== 'object' || reply.ok !== true) return
          if (!Array.isArray(reply.tools)) return
          for (var i = 0; i < reply.tools.length; i++) {
            var name = reply.tools[i]
            if (typeof name === 'string' && name !== '') registerCompat(name)
          }
        }).catch(function () {})
      }

      function doSwitch(sessionId, id) {
        if (snapshot.busy) return Promise.resolve(false)
        set({ busy: true, error: null })
        return callHost('/agent-switch', { sessionId, agentPreset: id }).then(function (reply) {
          if (reply !== null && typeof reply === 'object' && reply.ok === true) {
            sessions.noteAgentPreset(sessionId, id)
            set({ busy: false })
            reconcileCompat(sessionId)
            return true
          }
          var message = reply !== null && typeof reply === 'object' && typeof reply.message === 'string' ? reply.message : 'unknown error'
          set({ busy: false, error: t('error.apply', { message }) })
          return false
        }).catch(function (error) {
          set({ busy: false, error: t('error.apply', { message: messageOf(error) }) })
          return false
        })
      }

      ctx.effect(function () {
        var disposers = [
          ctx.remote.$on('settings/document-updated', function (ns) { if (ns === 'agent-presets') load() }),
          ctx.remote.$on('agent-preset/selected', function (sessionId) { reconcileCompat(sessionId) }),
          ctx.on('connection/reset', function () { load() }),
        ]
        return function () {
          for (var i = 0; i < disposers.length; i++) disposers[i]()
        }
      }, 'dsh-agent-switcher: refresh')

      var ChevronDownIcon = function (props) {
        return React.createElement('svg', Object.assign({ width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true }, props),
          React.createElement('path', { d: 'M3.5 5.25L7 8.75L10.5 5.25', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }
      var CheckIcon = function (props) {
        return React.createElement('svg', Object.assign({ width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }, props),
          React.createElement('path', { d: 'M3.5 8.5L6.5 11.5L12.5 5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }

      // Compatibility card for tool calls recorded under a previous agent.
      function CompatToolCard(props) {
        var toolName = props.toolName
        var block = props.block
        var t2 = props.t
        var done = block !== null && typeof block === 'object' && 'kind' in block
        var argsRaw = done
          ? (block.call !== null && block.call !== undefined ? block.call.argsRaw : undefined)
          : (block !== null && block !== undefined ? block.argsRaw : undefined)
        var argsPretty = ''
        if (typeof argsRaw === 'string' && argsRaw !== '') {
          try {
            argsPretty = JSON.stringify(JSON.parse(argsRaw), null, 2)
          } catch (error) {
            argsPretty = argsRaw
          }
        }
        var isError = done && block.isError === true
        var interrupted = done && block.error !== undefined && block.error !== null && block.error.code === 'interrupted'
        var state = !done ? 'running' : interrupted ? 'stopped' : isError ? 'error' : 'ok'
        var output = ''
        if (done && block.content !== undefined && Array.isArray(block.content)) {
          var parts = []
          for (var i = 0; i < block.content.length; i++) {
            var part = block.content[i]
            if (part.type === 'text') parts.push(part.text)
            else parts.push(JSON.stringify(part, null, 2))
          }
          output = parts.join('\n')
        }
        if (output === '' && done && block.error !== undefined && block.error !== null) {
          output = block.error.name + ': ' + block.error.code
        }
        return React.createElement('div', { className: 'ct_root', 'data-state': state, title: t2('compat.toolFrom') },
          React.createElement('div', { className: 'ct_head' },
            React.createElement('span', { className: 'ct_name' }, toolName),
            React.createElement('span', { className: 'ct_badge' }, t2('compat.badge'))),
          argsPretty !== '' && React.createElement('div', { className: 'ct_section' },
            React.createElement('div', { className: 'ct_label' }, t2('compat.args')),
            React.createElement('pre', { className: 'ct_code' }, argsPretty)),
          output !== '' && React.createElement('div', { className: 'ct_section' },
            React.createElement('div', { className: 'ct_label' }, state === 'error' ? t2('compat.error') : t2('compat.result')),
            React.createElement('pre', { className: 'ct_code', 'data-error': state === 'error' || undefined }, output)),
          state === 'running' && React.createElement('div', { className: 'ct_running' }, t2('compat.running')))
      }

      function AgentSwitcherChip(props) {
        var sessionId = props.sessionId
        var useSessions = props.useSessions
        var useAgentSwitcher = props.useAgentSwitcher
        var loadFn = props.load
        var selectFn = props.select
        var reconcileFn = props.reconcile
        var t3 = props.t
        var st = useAgentSwitcher(function (s) { return s })
        var summary = useSessions(function (s) { return s.byId[sessionId] })
        var openState = React.useState(false)
        var open = openState[0]
        var setOpen = openState[1]
        var pendingState = React.useState(null)
        var pendingId = pendingState[0]
        var setPendingId = pendingState[1]
        var rootRef = React.useRef(null)

        React.useEffect(function () {
          loadFn()
          reconcileFn()
        }, [loadFn, reconcileFn])
        React.useEffect(function () {
          if (!open) return
          function onDown(event) {
            if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
          }
          function onKey(event) {
            if (event.key === 'Escape') setOpen(false)
          }
          document.addEventListener('mousedown', onDown)
          document.addEventListener('keydown', onKey)
          return function () {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
          }
        }, [open])

        if (st.options.length === 0) return null

        var presetId = summary !== undefined ? summary.agentPreset : undefined
        var activeId = pendingId !== null ? pendingId : presetId
        var current = st.options.find(function (o) { return o.id === presetId })
        var pending = st.options.find(function (o) { return o.id === pendingId })
        var label = current !== undefined ? displayName(current) : t3('chip.fallback')
        var locked = summary !== undefined && !summary.blank

        var rows = st.options.map(function (option) {
          var name = displayName(option)
          var userMarked = option.trust === 'user' ? ' · ' + t3('menu.userTrust') : ''
          var selected = option.id === activeId
          var title = option.broken !== undefined ? t3('menu.broken', { reason: option.broken }) : (option.description !== undefined ? option.description : undefined)
          return React.createElement('button', {
            key: option.id,
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': selected,
            className: 'asw_option' + (selected ? ' asw_selected' : ''),
            title,
            disabled: option.broken !== undefined || st.busy,
            onClick: function () {
              if (locked) setPendingId(option.id)
              else selectFn(option.id).then(function (ok) { if (ok) setOpen(false) })
            },
          },
            React.createElement('span', { className: 'asw_optionCopy' },
              React.createElement('span', { className: 'asw_optionName' }, name + userMarked),
              option.description !== undefined && React.createElement('span', { className: 'asw_optionDesc' }, option.description)),
            React.createElement('span', { className: 'asw_check' }, selected ? React.createElement(CheckIcon, {}) : null))
        })

        var confirm = pendingId !== null && React.createElement('div', { className: 'asw_confirm' },
          React.createElement('span', { className: 'asw_confirmTitle' }, t3('menu.confirmTitle', { name: pending !== undefined ? displayName(pending) : pendingId })),
          React.createElement('span', { className: 'asw_confirmBody' }, t3('menu.locked')),
          React.createElement('span', { className: 'asw_confirmActions' },
            React.createElement('button', { type: 'button', className: 'asw_confirmAction', disabled: st.busy, onClick: function () {
              selectFn(pendingId).then(function (ok) {
                setPendingId(null)
                if (ok) setOpen(false)
              })
            } }, t3('menu.confirm')),
            React.createElement('button', { type: 'button', className: 'asw_confirmCancel', disabled: st.busy, onClick: function () { setPendingId(null) } }, t3('menu.cancel'))))

        return React.createElement('div', { className: 'asw_root', ref: rootRef },
          React.createElement('button', {
            type: 'button',
            className: 'asw_trigger',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-label': t3('menu.aria') + '：' + label,
            title: label,
            disabled: st.busy,
            onClick: function () { setOpen(!open) },
          },
            React.createElement('span', { className: 'asw_triggerLabel' }, label),
            React.createElement('span', { className: 'asw_triggerCaption' }, t3('chip.caption')),
            React.createElement(ChevronDownIcon, { className: 'asw_chevron' + (open ? ' asw_chevronOpen' : '') })),
          open ? React.createElement('div', { className: 'asw_menu', role: 'menu', 'aria-label': t3('menu.aria') },
            st.error !== null && React.createElement('div', { className: 'asw_error' }, st.error),
            confirm,
            locked && pendingId === null && React.createElement('div', { className: 'asw_hint' }, t3('menu.locked')),
            React.createElement('div', { className: 'asw_list' }, rows)) : null)
      }

      ctx.slots.inject('conversation.input.right', function () {
        return ctx.slots.register({
          name: 'conversation.input.right',
          id: 'agent-preset-switch',
          order: 10,
          locale: NS,
          inject: function (sessionId) {
            return {
              hooks: { agentSwitcher: store },
              load: load,
              select: function (id) { return doSwitch(sessionId, id) },
              reconcile: function () { return reconcileCompat(sessionId) },
            }
          },
        }, AgentSwitcherChip)
      })
    }

    exports.inject = ['connection', 'sessions', 'slots', 'locale', 'remote']
    exports.apply = apply
    return module.exports
  },
})
