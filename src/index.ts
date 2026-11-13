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
 * reads are unauthenticated, so the Host must stay bound to a loopback address.
 *
 * This module is the entry point and nothing else: the request helpers live in
 * `./host/request.ts` and the document store in `./host/storage.ts`, so the only
 * names the package exports are the two the Cordis loader needs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Loads the `ctx.webServer` augmentation, without which the service is `any`
// and every route shape below would go unchecked.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { isBodyTooLarge, readBody, sameOriginWrite } from './host/request.ts'
import { readStoredDocument, resolveDshHome, writeStoredDocument } from './host/storage.ts'
import {
  GROUP_ROUTE,
  GROUP_STORAGE_FILE,
  normalizeGroupDocument,
  type GroupDocument,
} from './shared/contract.ts'

/** Activation waits for the web carrier so the route registers on first boot. */
export const inject = ['webServer']

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
    cache = await readStoredDocument(file)
    return cache
  }

  // Serialized write chain: each commit starts after the previous one settles,
  // and a failed commit must not stall the ones queued behind it.
  let tail: Promise<void> = Promise.resolve()
  const enqueueWrite = (doc: GroupDocument): Promise<void> => {
    const run = tail.then(() => writeStoredDocument(dir, file, doc))
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
      } catch (error) {
        // Only the cap is a fact about the body's size: a stream failure rethrows
        // to the route's own 500 path. The reader left this upload paused rather
        // than closing the connection, so the 413 can still reach the caller; the
        // socket goes once that answer is out.
        if (!isBodyTooLarge(error)) throw error
        res.setHeader('connection', 'close')
        res.once('finish', () => req.destroy())
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
