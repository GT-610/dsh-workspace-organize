/**
 * Request-side helpers of the group route: the write fence and the capped body
 * reader.
 *
 * Both take a raw `IncomingMessage` and touch no other Host state, which is what
 * makes them reachable without a listening socket.
 */
import type { IncomingMessage } from 'node:http'
import { MAX_DOCUMENT_BYTES } from '../shared/contract.ts'

/**
 * Whether a write request comes from the same origin as the page that serves
 * this route.
 *
 * Browsers always attach `Sec-Fetch-Site` (modern) or `Origin`; a cross-site
 * browser write therefore carries one and is refused unless it names this Host.
 * A request carrying neither is not a browser form/JSON POST, and the desktop
 * shell uses exactly that shape: its authenticated reverse proxy strips both
 * headers before forwarding `/api/*` to this server. Refusing them made every
 * save from the desktop app a 403 while reads (which have no fence) kept working.
 * Either way the boundary is the Host's bind address, not this function: a Host
 * serving a LAN address accepts header-less writes from that network too.
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
  return true
}

/**
 * A body past {@link MAX_DOCUMENT_BYTES}, as distinct from a stream failure.
 *
 * The route has to tell the two apart: only a cap refusal is a `413` on a
 * connection it must close itself, while a broken stream is not a fact about the
 * body's size and belongs to the ordinary 500 path, where it is logged.
 */
class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError'
}

/**
 * Whether one body-read failure is the size cap rather than a stream failure.
 * @param error - what `readBody` rejected with.
 * @returns whether the body exceeded the cap.
 */
export function isBodyTooLarge(error: unknown): boolean {
  return error instanceof BodyTooLargeError
}

/**
 * Read one request body with the byte cap.
 *
 * An oversize body stops the read and leaves the request paused rather than
 * destroyed: the route answers `413` on that same socket and closes it once the
 * answer is out, which it could not do on a connection this function had already
 * torn down.
 * @param req - incoming request.
 * @returns the decoded body.
 * @throws {BodyTooLargeError} when the body exceeds {@link MAX_DOCUMENT_BYTES};
 * the caller owns the connection from then on.
 * @throws the stream's own error when reading the body fails.
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    // `pause` takes effect after the chunks already in flight, so `data` can still
    // fire for a body that has been refused; without this flag those would keep
    // growing `chunks`.
    let refused = false
    req.on('data', (chunk: Buffer) => {
      if (refused) return
      size += chunk.length
      if (size > MAX_DOCUMENT_BYTES) {
        refused = true
        req.pause()
        reject(new BodyTooLargeError('body too large'))
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
