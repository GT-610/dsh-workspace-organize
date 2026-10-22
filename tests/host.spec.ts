/**
 * The Host half's own boundaries: the write fence, the body cap, and the
 * storage location.
 *
 * These are the pieces the route depends on rather than the document it stores
 * (that is `contract.spec.ts`), and each one is reachable without booting a
 * server: the fence and the reader take a request, and the home resolver takes
 * an environment.
 */
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { MAX_DOCUMENT_BYTES } from '../src/shared/contract.ts'
import { readBody, resolveDshHome, sameOriginWrite } from '../src/index.ts'

/** A minimal request carrying only headers. */
function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

/** A request double: a stream of `data` events with a body, and its controls. */
class RequestStream extends EventEmitter {
  paused = false
  destroyed = false

  /** Record the flow stop the reader performs when it refuses a body. */
  pause(): void {
    this.paused = true
  }

  /** Record the close the route performs once it has answered. */
  destroy(): void {
    this.destroyed = true
  }
}

/**
 * Feed one request double a body the way a socket would.
 * @param req - the request double to emit on.
 * @param chunks - body chunks, in arrival order.
 * @returns the same request, for chaining.
 */
function feed(req: RequestStream, chunks: readonly string[]): RequestStream {
  for (const chunk of chunks) req.emit('data', Buffer.from(chunk))
  req.emit('end')
  return req
}

describe('sameOriginWrite', () => {
  it('accepts a same-origin or extension-less browser write', () => {
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'same-origin', host: 'localhost:3080' }))).toBe(true)
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'none', host: 'localhost:3080' }))).toBe(true)
  })

  it('refuses a cross-site write', () => {
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'cross-site', host: 'localhost:3080' }))).toBe(false)
  })

  it('falls back to the Origin header when Sec-Fetch-Site is absent', () => {
    expect(sameOriginWrite(request({ origin: 'http://localhost:3080', host: 'localhost:3080' }))).toBe(true)
    expect(sameOriginWrite(request({ origin: 'http://evil.test', host: 'localhost:3080' }))).toBe(false)
    expect(sameOriginWrite(request({ origin: 'not a url', host: 'localhost:3080' }))).toBe(false)
  })

  it('refuses a request carrying neither header — not a browser JSON POST', () => {
    expect(sameOriginWrite(request({ host: 'localhost:3080' }))).toBe(false)
  })
})

describe('readBody', () => {
  it('joins the chunks of a body within the cap', async () => {
    const body = '{"version":1,"groups":[]}'
    const req = new RequestStream()
    const pending = readBody(req as unknown as IncomingMessage)
    feed(req, [body.slice(0, 8), body.slice(8)])
    await expect(pending).resolves.toBe(body)
    expect(req.destroyed).toBe(false)
  })

  it('refuses a body past the cap and stops reading it', async () => {
    const req = new RequestStream()
    const pending = readBody(req as unknown as IncomingMessage)
    req.emit('data', Buffer.alloc(MAX_DOCUMENT_BYTES + 1))
    await expect(pending).rejects.toThrow('body too large')
    // The upload stops, but the connection stays open: the route answers 413 on
    // this socket and closes it once that answer is out, which it could not do on
    // a connection the reader had already destroyed.
    expect(req.paused).toBe(true)
    expect(req.destroyed).toBe(false)
  })

  it('takes a body of exactly the cap', async () => {
    const req = new RequestStream()
    const pending = readBody(req as unknown as IncomingMessage)
    feed(req, ['x'.repeat(MAX_DOCUMENT_BYTES)])
    await expect(pending).resolves.toHaveLength(MAX_DOCUMENT_BYTES)
    expect(req.destroyed).toBe(false)
  })
})

describe('resolveDshHome', () => {
  it('defaults to `~/.dsh` when the override is absent', () => {
    expect(resolveDshHome({})).toBe(resolvePath(join(homedir(), '.dsh')))
  })

  it('treats a blank override as unset', () => {
    // A blank `DSH_HOME` must not resolve the home to the process cwd: every
    // other DSH component would still read `~/.dsh`, and this document would
    // land in a directory nobody looks at.
    for (const blank of ['', '   ', '\t']) {
      expect(resolveDshHome({ DSH_HOME: blank })).toBe(resolvePath(join(homedir(), '.dsh')))
    }
  })

  it('expands a tilde prefix against the OS home', () => {
    expect(resolveDshHome({ DSH_HOME: '~/elsewhere' })).toBe(resolvePath(join(homedir(), 'elsewhere')))
    expect(resolveDshHome({ DSH_HOME: '~' })).toBe(resolvePath(homedir()))
  })

  it('returns an absolute path for a relative override', () => {
    expect(resolveDshHome({ DSH_HOME: 'relative/home' })).toBe(resolvePath('relative/home'))
  })
})
