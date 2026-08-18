// Client-half smoke test: bundle loads, registers the composer chip.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let definition = null
const sandbox = {
  window: { __ModuleLoader__: { load: (def) => { definition = def } } },
  fetch: async () => { throw new Error('fetch must not run during apply') },
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
if (definition === null) throw new Error('bundle did not call __ModuleLoader__.load')
if (definition.id !== 'dsh-agent-switcher') throw new Error('bundle id mismatch: ' + definition.id)

const react = {}
const required = []
const exportsObj = definition.factory((name) => { required.push(name); return name === 'react' ? react : undefined })
if (exportsObj.inject === undefined || exportsObj.apply === undefined) throw new Error('bundle exports missing inject/apply')
if (required.length !== 1 || required[0] !== 'react') throw new Error('unexpected requires: ' + JSON.stringify(required))

// Apply with mocked services; the component body never runs (registration only).
const registrations = []
const subscriptions = []
const ctx = {
  connection: { api: { agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [{ id: 'standard', trust: 'system' }] } } }) } } },
  sessions: { noteAgentPreset: () => {} },
  locale: { bind: () => (key) => key, register: () => () => {} },
  remote: { $on: (ev, fn) => { subscriptions.push(ev); return () => {} } },
  on: () => () => {},
  effect: (fn) => fn(),
  slots: {
    inject: (name, cb) => { cb(); return () => {} },
    register: (opts, component) => { registrations.push({ opts, component }); return () => {} },
  },
}
exportsObj.apply(ctx)
const chip = registrations.find((r) => r.opts && r.opts.name === 'conversation.input.right' && r.opts.id === 'agent-preset-switch')
if (chip === undefined) throw new Error('composer chip registration missing; got ' + JSON.stringify(registrations.map((r) => r.opts && r.opts.name)))
if (typeof chip.component !== 'function') throw new Error('chip component missing')
if (!subscriptions.includes('agent-preset/selected')) throw new Error('agent-preset/selected subscription missing')
console.log('registered slots:', registrations.map((r) => r.opts.name + '#' + r.opts.id).join(', '))
console.log('remote subscriptions:', subscriptions.join(', '))
console.log('CLIENT SMOKE OK')
