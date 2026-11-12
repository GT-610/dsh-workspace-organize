import { IncomingMessage } from "node:http";
import { Context } from "@deepseek-ai/cordis";
//#region src/shared/contract.d.ts
/** One named group of Workspaces, in display order. */
interface WorkspaceGroup {
  /** Stable opaque group id, unique inside the document. */
  id: string;
  /** Operator-facing name. */
  name: string;
  /** Member Workspace ids, in the order the group lists them. */
  workspaceIds: string[];
}
/** The whole persisted document. */
interface GroupDocument {
  /** Format version; the only version this plugin writes. */
  version: 1;
  /** Groups in display order. */
  groups: WorkspaceGroup[];
}
//#endregion
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
 * Read and validate one stored group document.
 *
 * A missing file is a fresh install and reads as an empty document. Any other
 * failure — an unreadable file, malformed JSON, or a shape the validator
 * rejects — is thrown: answering "empty" there would let the Client discard its
 * localStorage mirror and show an installation with no groups.
 * @param file - absolute path of the stored document.
 * @returns the normalized document.
 * @throws when the file exists but cannot be read or validated.
 */
declare function readStoredDocument(file: string): Promise<GroupDocument>;
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
 * The loopback server remains the boundary for local code either way.
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
 * @throws {BodyTooLargeError} when the body exceeds {@link MAX_DOCUMENT_BYTES};
 * the caller owns the connection from then on.
 * @throws the stream's own error when reading the body fails.
 */
declare function readBody(req: IncomingMessage): Promise<string>;
/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
declare function apply(ctx: Context): (() => void) | undefined;
//#endregion
export { apply, inject, readBody, readStoredDocument, resolveDshHome, sameOriginWrite };
//# sourceMappingURL=index.d.ts.map