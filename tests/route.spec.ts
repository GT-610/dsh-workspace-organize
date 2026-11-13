/**
 * The registered route, driven the way the Host drives it.
 *
 * `host.spec.ts` covers the request and storage helpers one at a time; this file
 * covers the wiring between them, which is what a real save travels through:
 * the status matrix, the headers, the serialized commit and the cache behind it.
 * The carrier is a double, so every case runs without a listening socket.
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'
import {
  GROUP_ROUTE,
  GROUP_STORAGE_FILE,
  MAX_DOCUMENT_BYTES,
  emptyGroupDocument,
  type GroupDocument,
} from '../src/shared/contract.ts'

/** What `webServer.register` receives, narrowed to what `apply` sends it. */
interface RegisteredRoute {
  kind: string
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
}

/** One request double: the headers a route reads plus a body it can stream. */
class FakeRequest extends EventEmitter {
  paused = false
  destroyed = false

  constructor(
    readonly method: string,
    readonly headers: Record<string, string>,
    readonly chunks: readonly Buffer[] = [],
  ) {
    super()
  }

  pause(): void {
    this.paused = true
  }

  destroy(): void {
    this.destroyed = true
  }

  /** Stream the queued body the way a socket would, after the route subscribes. */
  flush(): void {
    for (const chunk of this.chunks) this.emit('data', chunk)
    this.emit('end')
  }

  /** Fail mid-read instead of ending. */
  fail(error: Error): void {
    this.emit('error', error)
  }
}

/** One response double: status, headers, body, and the finish event. */
class FakeResponse extends EventEmitter {
  statusCode = 0
  readonly headers: Record<string, string> = {}
  body = ''
  ended = false

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value
  }

  end(chunk?: string): void {
    if (chunk !== undefined) this.body += chunk
    this.ended = true
    this.emit('finish')
  }
}

/** A Cordis context carrying only what `apply` reaches for. */
function mount(): { ctx: Context; warnings: string[]; route: () => RegisteredRoute | undefined } {
  const routes = new Map<string, RegisteredRoute>()
  const warnings: string[] = []
  const ctx = {
    get: (name: string) => (name === 'webServer'
      ? {
          register: (route: RegisteredRoute) => {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        }
      : undefined),
    logger: { warn: (message: string) => warnings.push(message) },
  } as unknown as Context
  return { ctx, warnings, route: () => routes.get(GROUP_ROUTE) }
}

/** Drive one request through the registered route. */
async function call(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  req: FakeRequest,
  res: FakeResponse,
): Promise<void> {
  // The route subscribes to the body only once it reaches `readBody`, so the
  // stream is emitted on a later turn to land after those listeners attach.
  setImmediate(() => req.flush())
  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
}

/** A stored-document fixture. */
const DOC: GroupDocument = { version: 1, groups: [{ id: 'g1', name: 'Work', workspaceIds: ['repo'] }] }

describe('group route', () => {
  let home: string
  let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  let warnings: string[]

  const storedFile = (): string => join(home, 'storages', GROUP_STORAGE_FILE)

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-dwo-route-'))
    process.env.DSH_HOME = home
    const mounted = mount()
    warnings = mounted.warnings
    expect(apply(mounted.ctx)).toBeTypeOf('function')
    const route = mounted.route()
    expect(route?.path).toBe(GROUP_ROUTE)
    handler = route?.handler as typeof handler
  })

  afterEach(async () => {
    delete process.env.DSH_HOME
    await rm(home, { recursive: true, force: true })
  })

  it('serves a fresh install as an empty document with live-state headers', async () => {
    const res = new FakeResponse()
    await call(handler, new FakeRequest('GET', {}), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    // A cached answer would render a tree another window has already replaced.
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.body)).toEqual(emptyGroupDocument())
  })

  it('keeps a GET\'s headers on HEAD and drops its body', async () => {
    const res = new FakeResponse()
    await call(handler, new FakeRequest('HEAD', {}), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.body).toBe('')
  })

  it('refuses any method but GET, HEAD and POST', async () => {
    const res = new FakeResponse()
    await call(handler, new FakeRequest('PUT', {}), res)
    expect(res.statusCode).toBe(405)
    expect(JSON.parse(res.body)).toEqual({ error: 'method not allowed' })
  })

  it('refuses a cross-site write without touching the stored document', async () => {
    const res = new FakeResponse()
    await call(
      handler,
      new FakeRequest('POST', { 'sec-fetch-site': 'cross-site', host: 'localhost:3080' }, [Buffer.from(JSON.stringify(DOC))]),
      res,
    )
    expect(res.statusCode).toBe(403)
    await expect(readFile(storedFile(), 'utf8')).rejects.toThrow()
  })

  it('rejects a body that is not JSON', async () => {
    const res = new FakeResponse()
    await call(handler, new FakeRequest('POST', {}, [Buffer.from('{not json')]), res)
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid json body' })
  })

  it('rejects a document the validator refuses', async () => {
    const res = new FakeResponse()
    await call(handler, new FakeRequest('POST', {}, [Buffer.from(JSON.stringify({ groups: [{ id: '', name: 'a' }] }))]), res)
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid group document' })
  })

  it('commits a posted document, then serves it back from the cache', async () => {
    const posted = new FakeResponse()
    await call(handler, new FakeRequest('POST', {}, [Buffer.from(JSON.stringify(DOC))]), posted)
    expect(posted.statusCode).toBe(200)
    expect(JSON.parse(posted.body)).toEqual(DOC)
    expect(JSON.parse(await readFile(storedFile(), 'utf8'))).toEqual(DOC)

    const read = new FakeResponse()
    await call(handler, new FakeRequest('GET', {}), read)
    expect(JSON.parse(read.body)).toEqual(DOC)
  })

  it('refuses a body past the cap and closes the connection once the answer is out', async () => {
    const req = new FakeRequest('POST', {}, [Buffer.alloc(MAX_DOCUMENT_BYTES + 1)])
    const res = new FakeResponse()
    await call(handler, req, res)
    expect(res.statusCode).toBe(413)
    expect(res.headers.connection).toBe('close')
    expect(req.paused).toBe(true)
    // The 413 reaches the caller first; only then does the socket go.
    expect(req.destroyed).toBe(true)
  })

  it('answers 500 and logs when the body stream fails', async () => {
    const req = new FakeRequest('POST', {})
    const res = new FakeResponse()
    setImmediate(() => req.fail(new Error('aborted')))
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    expect(res.statusCode).toBe(500)
    expect(warnings.some(message => message.includes('failed'))).toBe(true)
  })

  it('warns and registers nothing when the carrier has no web server', () => {
    const warned: string[] = []
    const ctx = {
      get: () => undefined,
      logger: { warn: (message: string) => warned.push(message) },
    } as unknown as Context
    expect(apply(ctx)).toBeUndefined()
    expect(warned.join(' ')).toContain('webServer service is unavailable')
  })
})
