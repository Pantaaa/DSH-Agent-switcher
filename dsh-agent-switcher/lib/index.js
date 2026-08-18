/**
 * dsh-agent-switcher — Host half.
 *
 * Two exact HTTP routes on the webServer service are the static-plugin
 * counterpart of the dynamic plugin's package-private RPC:
 *
 *   POST /agent-switch        { sessionId, agentPreset } -> recompose one
 *                             session's agent onto a different preset, even
 *                             after its conversation started (the browser
 *                             agentPreset.select RPC refuses that with
 *                             'agent-preset-locked'; recompose itself is
 *                             caller-checked and performs the re-link).
 *   POST /agent-used-tools    { sessionId } -> every distinct tool name the
 *                             session ever called, so the browser half can
 *                             register compatibility tool views for calls
 *                             recorded under a previous agent.
 *
 * The switch appends the stock 'agent-preset/selected' session event, so the
 * session list, the header label, and every browser surface follow through
 * the existing forwarded-remote-event chain (no custom event allowlist
 * needed).
 */

export const inject = ['webServer', 'agentPresets', 'agents']

export function apply(ctx) {
  const presets = ctx.agentPresets
  const agents = ctx.agents

  // Per-session serialization, mirroring the api-proxy's preset switch queue.
  const switches = new Map()

  const readJson = (req) => new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (data === '') return resolve({})
      try { resolve(JSON.parse(data)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })

  const send = (res, status, payload) => {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  const handle = async (req, res, run) => {
    if (req.method !== 'POST') {
      return send(res, 405, { ok: false, message: 'method not allowed; use POST' })
    }
    let args
    try {
      args = await readJson(req)
    } catch (error) {
      return send(res, 400, { ok: false, message: String((error && error.message) || error) })
    }
    try {
      const result = await run(args)
      send(res, 200, result)
    } catch (error) {
      send(res, 500, { ok: false, message: String((error && error.message) || error) })
    }
  }

  const messageOf = (error) => String((error && error.message) || error)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-switch',
    handler: (req, res) => handle(req, res, async (args) => {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined
      const agentPreset = typeof args.agentPreset === 'string' ? args.agentPreset : undefined
      if (sessionId === undefined || agentPreset === undefined) {
        return { ok: false, message: 'invalid arguments: sessionId and agentPreset are required' }
      }
      const queued = switches.get(sessionId) || Promise.resolve()
      const turn = queued.then(async () => {
        const agent = agents.get(sessionId)
        if (agent === undefined) {
          return { ok: false, message: 'session is not open; only an open session can switch' }
        }
        try {
          const preset = await presets.recompose(agent.ctx, agentPreset)
          agent.session.append('agent-preset/selected', { agentPreset: preset.id })
          return { ok: true, agentPreset: preset.id }
        } catch (error) {
          return { ok: false, message: messageOf(error) }
        }
      })
      switches.set(sessionId, turn.catch(() => undefined))
      try {
        return await turn
      } finally {
        if (switches.get(sessionId) === turn) switches.delete(sessionId)
      }
    }),
  }), 'dsh-agent-switcher: /agent-switch route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/agent-used-tools',
    handler: (req, res) => handle(req, res, async (args) => {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined
      if (sessionId === undefined) {
        return { ok: false, message: 'invalid arguments: sessionId is required' }
      }
      const agent = agents.get(sessionId)
      if (agent === undefined) {
        return { ok: false, message: 'session is not open' }
      }
      const names = []
      const seen = new Set()
      for (const event of agent.session.events) {
        if (event.type !== 'tool/call') continue
        const data = event.data
        const name = data !== null && data !== undefined && typeof data.name === 'string' ? data.name : ''
        if (name !== '' && !seen.has(name)) {
          seen.add(name)
          names.push(name)
        }
      }
      return { ok: true, tools: names }
    }),
  }), 'dsh-agent-switcher: /agent-used-tools route')
}
