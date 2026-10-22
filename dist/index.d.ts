import { IncomingMessage } from "node:http";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Activation waits for the web carrier so the route registers on first boot. */
declare const inject: string[];
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
declare function resolveDshHome(env?: Readonly<Record<string, string | undefined>>): string;
/**
 * Whether a write request comes from the same origin as the page that serves
 * this route. Browsers always attach `Sec-Fetch-Site` (modern) or `Origin`;
 * a request carrying neither is not a browser form/JSON POST we should accept.
 * @param req - incoming request.
 * @returns whether the write may proceed.
 */
declare function sameOriginWrite(req: IncomingMessage): boolean;
/**
 * Read one request body with the byte cap.
 *
 * An oversize body stops the read and leaves the request paused rather than
 * destroyed: the route answers `413` on that same socket and closes it once the
 * answer is out, which it could not do on a connection this function had already
 * torn down.
 * @param req - incoming request.
 * @returns the decoded body.
 * @throws when the body exceeds {@link MAX_DOCUMENT_BYTES}; the caller owns the
 * connection from then on.
 */
declare function readBody(req: IncomingMessage): Promise<string>;
/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
declare function apply(ctx: Context): (() => void) | undefined;
//#endregion
export { apply, inject, readBody, resolveDshHome, sameOriginWrite };
//# sourceMappingURL=index.d.ts.map