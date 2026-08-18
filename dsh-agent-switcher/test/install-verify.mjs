// End-to-end verification of the installed plugin, mirroring DSH boot steps.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire('D:/npm-global/node_modules/@deepseek-ai/dsh/package.json')

// 1) Host half: ESM import from the loader chain (as cordis-plugin-loader does)
const mod = await import('dsh-agent-switcher')
console.log('1. host ESM import OK:', Object.keys(mod).join(','))

// 2) Client half: client-modules processOne sequence
const pkgPath = require.resolve('dsh-agent-switcher/package.json')
console.log('2. package.json resolve OK:', pkgPath.endsWith('package.json'))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.dsh?.client?.platform !== 'web') throw new Error('dsh.client missing')
const clientRel = pkg.exports['./client']
if (typeof clientRel !== 'string') throw new Error('exports["./client"] missing')
const clientPath = join(dirname(pkgPath), clientRel)
const bundle = readFileSync(clientPath, 'utf8')
if (!bundle.includes('window.__ModuleLoader__.load')) throw new Error('bundle format wrong')
console.log('3. client bundle OK:', clientPath, '(' + bundle.length + ' bytes)')

// 3) The client bundle must resolve react through the shell registry only
const reqs = [...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map(m => m[1])
console.log('4. bundle requires:', JSON.stringify([...new Set(reqs)]))
