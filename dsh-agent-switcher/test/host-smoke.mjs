// Host-half smoke test: registers routes, switches a session, collects tools.
import { apply } from '../lib/index.js'

const switched = []
const appended = []
const agent = {
  ctx: { id: 's1' },
  session: {
    events: [
      { type: 'tool/call', data: { name: 'read' } },
      { type: 'tool/call', data: { name: 'bash' } },
      { type: 'tool/call', data: { name: 'read' } },
      { type: 'turn/start', data: {} },
    ],
    append: (type, data) => appended.push({ type, data }),
  },
}
const routes = new Map()
const ctx = {
  agentPresets: {
    recompose: async (agentCtx, id) => {
      switched.push({ agentCtx, id })
      return { id }
    },
  },
  agents: { get: (id) => (id === 's1' ? agent : undefined) },
  effect: (fn) => fn(),
  webServer: {
    register: (route) => {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  },
}
apply(ctx)

import { Readable } from 'node:stream'
const call = (path, body) => new Promise((resolve) => {
  const handler = routes.get(path)
  if (handler === undefined) return resolve({ error: 'no route ' + path })
  const req = Readable.from([JSON.stringify(body)])
  req.method = 'POST'
  req.setEncoding = () => {}
  let status = 0
  let payload = ''
  const res = {
    writeHead: (s) => { status = s },
    end: (b) => { payload = b; resolve({ status, payload: JSON.parse(b) }) },
  }
  handler(req, res)
})

const sw = await call('/agent-switch', { sessionId: 's1', agentPreset: 'data-analyst' })
const sw2 = await call('/agent-switch', { sessionId: 'nope', agentPreset: 'data-analyst' })
const tools = await call('/agent-used-tools', { sessionId: 's1' })
const bad = await call('/agent-switch', { sessionId: 's1', agentPreset: 42 })

console.log('switch:', JSON.stringify(sw))
console.log('switch-unopen:', JSON.stringify(sw2))
console.log('tools:', JSON.stringify(tools))
console.log('invalid:', JSON.stringify(bad))
console.log('recompose calls:', switched.length, 'appended events:', appended.length)

const ok = sw.status === 200 && sw.payload.ok === true
  && sw2.status === 200 && sw2.payload.ok === false
  && tools.payload.ok === true && tools.payload.tools.length === 2
  && bad.status === 200 && bad.payload.ok === false
  && switched.length === 1 && appended.length === 1 && appended[0].type === 'agent-preset/selected'
if (!ok) { console.error('SMOKE FAILED'); process.exit(1) }
console.log('HOST SMOKE OK')
