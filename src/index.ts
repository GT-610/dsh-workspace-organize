/**
 * Host half of dsh-workspace-organize.
 *
 * Registers one local route, {@link GROUP_ROUTE}, that persists the group
 * document the Client half edits. Groups are a plugin-private virtual layer:
 * the official Workspace registry (records, sessions, archive and pin sets) is
 * never touched here — only this document is stored.
 *
 * Storage: `$DSH_HOME/storages/workspace-organize-groups.json` (the same
 * directory the workspace domain itself uses), written atomically through a
 * temporary file and a rename on a serialized write chain. Write requests are
 * fenced to same-origin browser callers (`Sec-Fetch-Site`/`Origin` checks);
 * reads are open because the server itself is loopback-trusted.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
// `resolve` is aliased: the Promise executors below bind their own `resolve`.
import { join, resolve as resolvePath } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Loads the `ctx.webServer` augmentation, without which the service is `any`
// and every route shape below would go unchecked.
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  GROUP_ROUTE,
  GROUP_STORAGE_FILE,
  MAX_DOCUMENT_BYTES,
  emptyGroupDocument,
  normalizeGroupDocument,
  type GroupDocument,
} from './shared/contract.ts'

/** Activation waits for the web carrier so the route registers on first boot. */
export const inject = ['webServer']

/**
 * Expand the one tilde prefix the harness accepts in a configured path.
 * @param path - configured path, possibly starting with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the input unchanged when it has no prefix.
 */
function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the DeepSeek Harness home exactly as the rest of the Host does
 * (`@deepseek-ai/dsh-home-paths`' `resolveDshHome`).
 *
 * Reading `DSH_HOME` raw would diverge in three ways that matter here: a blank
 * override would resolve this plugin's storage to a `storages` directory under
 * the process cwd instead of `~/.dsh`, a `~/…` override would be taken
 * literally and create a directory named `~`, and a relative one would keep
 * depending on the cwd. The document would then land outside the tree every
 * other DSH component reads, and look lost.
 * @param env - environment to read; defaults to the process environment.
 * @returns the absolute harness home.
 */
export function resolveDshHome(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.DSH_HOME
  return resolvePath(
    configured !== undefined && configured.trim().length > 0
      ? expandHomePath(configured)
      : join(homedir(), '.dsh'),
  )
}

/**
 * Whether a write request comes from the same origin as the page that serves
 * this route. Browsers always attach `Sec-Fetch-Site` (modern) or `Origin`;
 * a request carrying neither is not a browser form/JSON POST we should accept.
 * @param req - incoming request.
 * @returns whether the write may proceed.
 */
export function sameOriginWrite(req: IncomingMessage): boolean {
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

/**
 * Read one request body with the byte cap.
 * @param req - incoming request.
 * @returns the decoded body.
 * @throws when the body exceeds {@link MAX_DOCUMENT_BYTES}.
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    // `destroy` takes effect asynchronously, so `data` still fires for the
    // chunks already in flight. Without this flag those would keep growing
    // `chunks` for a body the route has already refused.
    let refused = false
    req.on('data', (chunk: Buffer) => {
      if (refused) return
      size += chunk.length
      if (size > MAX_DOCUMENT_BYTES) {
        refused = true
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!refused) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (error) => {
      if (!refused) reject(error)
    })
  })
}

/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
export function apply(ctx: Context): (() => void) | undefined {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    // `inject` normally guarantees the service; this covers a carrier that
    // unloads between activation and the first request.
    ctx.logger.warn('workspace-organize: webServer service is unavailable; groups stay browser-local')
    return undefined
  }

  const home = resolveDshHome()
  const dir = join(home, 'storages')
  const file = join(dir, GROUP_STORAGE_FILE)

  let cache: GroupDocument | undefined
  const readDoc = async (): Promise<GroupDocument> => {
    if (cache !== undefined) return cache
    try {
      cache = normalizeGroupDocument(JSON.parse(await readFile(file, 'utf8'))) ?? undefined
    } catch {
      cache = undefined
    }
    return cache ?? emptyGroupDocument()
  }

  // Serialized write chain with an atomic tmp+rename commit.
  let tail: Promise<void> = Promise.resolve()
  const enqueueWrite = (doc: GroupDocument): Promise<void> => {
    const run = tail.then(async () => {
      await mkdir(dir, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
      await rename(tmp, file)
    })
    tail = run.catch(() => undefined)
    return run
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reply = (code: number, body: unknown): void => {
      res.statusCode = code
      res.setHeader('content-type', 'application/json; charset=utf-8')
      // Reads answer live plugin state: a cached copy would let a reload render
      // a stale group tree after an edit made elsewhere.
      res.setHeader('cache-control', 'no-store')
      // HEAD keeps the headers a GET would send and drops the body.
      if (req.method === 'HEAD') {
        res.end()
        return
      }
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
      let body: string
      try {
        body = await readBody(req)
      } catch {
        // The byte cap is the only reason a read rejects, and that body was
        // abandoned unparsed: an oversize request is a 413, never a malformed one.
        reply(413, { error: 'body too large' })
        return
      }
      let raw: unknown
      try {
        raw = JSON.parse(body)
      } catch {
        reply(400, { error: 'invalid json body' })
        return
      }
      const doc = normalizeGroupDocument(raw)
      if (doc === null) {
        reply(400, { error: 'invalid group document' })
        return
      }
      await enqueueWrite(doc)
      cache = doc
      reply(200, doc)
    } catch (error) {
      ctx.logger.warn(`workspace-organize: ${req.method ?? 'GET'} ${GROUP_ROUTE} failed: ${String(error)}`)
      reply(500, { error: 'internal error' })
    }
  }

  return webServer.register({ kind: 'exact', path: GROUP_ROUTE, handler })
}
