/**
 * Host half of dsh-workspace-organize.
 *
 * Registers one local route, `/api/workspace-organize`, that persists the
 * group document the Client half edits. Groups are a plugin-private virtual
 * layer: the official Workspace registry (records, sessions, archive and pin
 * sets) is never touched here — only this document is stored.
 *
 * Storage: `$DSH_HOME/storages/workspace-organize-groups.json` (same directory
 * the workspace domain itself uses), written atomically through a tmp file and
 * rename on a serialized write chain. Write requests are fenced to same-origin
 * browser callers (`Sec-Fetch-Site`/`Origin` checks); reads are open because
 * the server itself is loopback-trusted.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

/** Exact route path registered on the web server. */
const ROUTE = '/api/workspace-organize'
/** Request body cap: group documents are tiny; 1 MiB is generous. */
const MAX_BODY_BYTES = 1_000_000

/**
 * Validate and normalize one group document from the wire.
 * @param raw - Parsed JSON body or file content.
 * @returns the normalized document, or `null` when the shape is invalid.
 */
function normalizeDoc(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const groups = raw.groups
  if (!Array.isArray(groups) || groups.length > 200) return null
  const seen = new Set()
  const out = []
  for (const group of groups) {
    if (group === null || typeof group !== 'object') return null
    const { id, name } = group
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null
    if (typeof name !== 'string' || name.length > 200) return null
    if (seen.has(id)) return null
    seen.add(id)
    const workspaceIds = group.workspaceIds
    if (!Array.isArray(workspaceIds) || workspaceIds.length > 500) return null
    if (!workspaceIds.every(id2 => typeof id2 === 'string' && id2.length > 0 && id2.length <= 128)) return null
    out.push({ id, name, workspaceIds: [...workspaceIds] })
  }
  return { version: 1, groups: out }
}

/**
 * Whether a write request comes from the same origin as the page that serves
 * this route. Browsers always attach `Sec-Fetch-Site` (modern) or `Origin`;
 * a request carrying neither is not a browser form/JSON POST we should accept.
 * @param req - Incoming request.
 * @returns whether the write may proceed.
 */
function sameOriginWrite(req) {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string') return site === 'same-origin' || site === 'none'
  const origin = req.headers.origin
  if (typeof origin === 'string') {
    try {
      return new URL(origin).host === req.headers.host
    } catch {
      return false
    }
  }
  return false
}

/** Read one request body with the byte cap; rejects when the body is too large. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Activation waits for the web carrier so the route registers on first boot. */
export const inject = ['webServer']

/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    ctx.logger?.warn?.('workspace-organize: webServer service is unavailable; groups stay browser-local')
    return
  }

  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(home, 'storages')
  const file = join(dir, 'workspace-organize-groups.json')

  let cache
  const readDoc = async () => {
    if (cache !== undefined) return cache
    try {
      cache = normalizeDoc(JSON.parse(await readFile(file, 'utf8')))
    } catch {
      cache = undefined
    }
    return cache ?? { version: 1, groups: [] }
  }

  // Serialized write chain with an atomic tmp+rename commit.
  let tail = Promise.resolve()
  const enqueueWrite = (doc) => {
    const run = tail.then(async () => {
      await mkdir(dir, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
      await rename(tmp, file)
    })
    tail = run.catch(() => {})
    return run
  }

  const handler = async (req, res) => {
    const reply = (code, body) => {
      res.statusCode = code
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        reply(200, await readDoc())
        return
      }
      if (req.method !== 'POST') {
        reply(405, { error: 'method not allowed' })
        return
      }
      if (!sameOriginWrite(req)) {
        reply(403, { error: 'cross-origin write refused' })
        return
      }
      let raw
      try {
        raw = JSON.parse(await readBody(req))
      } catch {
        reply(400, { error: 'invalid json body' })
        return
      }
      const doc = normalizeDoc(raw)
      if (doc === null) {
        reply(400, { error: 'invalid group document' })
        return
      }
      await enqueueWrite(doc)
      cache = doc
      reply(200, doc)
    } catch (error) {
      ctx.logger?.warn?.(`workspace-organize: ${req.method} ${ROUTE} failed: ${String(error)}`)
      reply(500, { error: 'internal error' })
    }
  }

  return webServer.register({ kind: 'exact', path: ROUTE, handler })
}
