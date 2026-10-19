import { IncomingMessage } from "node:http";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Activation waits for the web carrier so the route registers on first boot. */
declare const inject: string[];
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
 * @param req - incoming request.
 * @returns the decoded body.
 * @throws when the body exceeds {@link MAX_DOCUMENT_BYTES}.
 */
declare function readBody(req: IncomingMessage): Promise<string>;
/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
declare function apply(ctx: Context): (() => void) | undefined;
//#endregion
export { apply, inject, readBody, sameOriginWrite };
//# sourceMappingURL=index.d.ts.map