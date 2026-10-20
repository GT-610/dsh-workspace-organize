import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
//#region src/shared/contract.ts
/**
* The group document: the only state this plugin owns.
*
* It is a plugin-private virtual layer over the official Workspace registry —
* records, sessions, and the archive/pin sets are never touched. Both halves
* import these declarations, so the wire shape and its validation cannot drift
* between the Host route that stores it and the Client that edits it.
*
* Ids stay plain strings here: this is JSON on the wire and on disk, and the
* branded runtime types belong to the packages that mint them.
*/
/** Absolute route the Host half registers and the Client half reads and writes. */
const GROUP_ROUTE = "/api/workspace-organize";
/** File name inside `$DSH_HOME/storages`. */
const GROUP_STORAGE_FILE = "workspace-organize-groups.json";
/** The document a fresh install starts from. */
function emptyGroupDocument() {
	return {
		version: 1,
		groups: []
	};
}
/** A non-empty string no longer than `limit` characters. */
function isBoundedId(value, limit) {
	return typeof value === "string" && value.length > 0 && value.length <= limit;
}
/**
* Validate and normalize one group document from the wire or from disk.
*
* Unknown extra fields are dropped, so a document written by a later version
* still loads; a malformed one is rejected whole rather than partially applied.
* @param raw - parsed JSON body or file content.
* @returns the normalized document, or `null` when the shape is invalid.
*/
function normalizeGroupDocument(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const groups = raw.groups;
	if (!Array.isArray(groups) || groups.length > 200) return null;
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const group of groups) {
		if (group === null || typeof group !== "object" || Array.isArray(group)) return null;
		const { id, name, workspaceIds } = group;
		if (!isBoundedId(id, 128) || typeof name !== "string" || name.length > 200) return null;
		if (seen.has(id)) return null;
		seen.add(id);
		if (!Array.isArray(workspaceIds) || workspaceIds.length > 500) return null;
		if (!workspaceIds.every((member) => isBoundedId(member, 128))) return null;
		out.push({
			id,
			name,
			workspaceIds: [...workspaceIds]
		});
	}
	return {
		version: 1,
		groups: out
	};
}
//#endregion
//#region src/index.ts
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
/** Activation waits for the web carrier so the route registers on first boot. */
const inject = ["webServer"];
/**
* Whether a write request comes from the same origin as the page that serves
* this route. Browsers always attach `Sec-Fetch-Site` (modern) or `Origin`;
* a request carrying neither is not a browser form/JSON POST we should accept.
* @param req - incoming request.
* @returns whether the write may proceed.
*/
function sameOriginWrite(req) {
	const site = req.headers["sec-fetch-site"];
	if (typeof site === "string") return site === "same-origin" || site === "none";
	const origin = req.headers.origin;
	if (typeof origin === "string") try {
		return new URL(origin).host === req.headers.host;
	} catch {
		return false;
	}
	return false;
}
/**
* Read one request body with the byte cap.
* @param req - incoming request.
* @returns the decoded body.
* @throws when the body exceeds {@link MAX_DOCUMENT_BYTES}.
*/
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 1e6) {
				reject(/* @__PURE__ */ new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
/**
* Plugin apply: register the route and return its disposer.
* @param ctx - Host Cordis context.
* @returns route disposer.
*/
function apply(ctx) {
	const webServer = ctx.get("webServer");
	if (webServer === void 0) {
		ctx.logger.warn("workspace-organize: webServer service is unavailable; groups stay browser-local");
		return;
	}
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const dir = join(home, "storages");
	const file = join(dir, GROUP_STORAGE_FILE);
	let cache;
	const readDoc = async () => {
		if (cache !== void 0) return cache;
		try {
			cache = normalizeGroupDocument(JSON.parse(await readFile(file, "utf8"))) ?? void 0;
		} catch {
			cache = void 0;
		}
		return cache ?? emptyGroupDocument();
	};
	let tail = Promise.resolve();
	const enqueueWrite = (doc) => {
		const run = tail.then(async () => {
			await mkdir(dir, { recursive: true });
			const tmp = `${file}.${process.pid}.tmp`;
			await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
			await rename(tmp, file);
		});
		tail = run.catch(() => void 0);
		return run;
	};
	const handler = async (req, res) => {
		const reply = (code, body) => {
			res.statusCode = code;
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.setHeader("cache-control", "no-store");
			if (req.method === "HEAD") {
				res.end();
				return;
			}
			res.end(JSON.stringify(body));
		};
		try {
			if (req.method === "GET" || req.method === "HEAD") {
				reply(200, await readDoc());
				return;
			}
			if (req.method !== "POST") {
				reply(405, { error: "method not allowed" });
				return;
			}
			if (!sameOriginWrite(req)) {
				reply(403, { error: "cross-origin write refused" });
				return;
			}
			let raw;
			try {
				raw = JSON.parse(await readBody(req));
			} catch {
				reply(400, { error: "invalid json body" });
				return;
			}
			const doc = normalizeGroupDocument(raw);
			if (doc === null) {
				reply(400, { error: "invalid group document" });
				return;
			}
			await enqueueWrite(doc);
			cache = doc;
			reply(200, doc);
		} catch (error) {
			ctx.logger.warn(`workspace-organize: ${req.method ?? "GET"} ${GROUP_ROUTE} failed: ${String(error)}`);
			reply(500, { error: "internal error" });
		}
	};
	return webServer.register({
		kind: "exact",
		path: GROUP_ROUTE,
		handler
	});
}
//#endregion
export { apply, inject, readBody, sameOriginWrite };

//# sourceMappingURL=index.js.map