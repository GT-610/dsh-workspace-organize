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
export const GROUP_ROUTE = '/api/workspace-organize'

/** File name inside `$DSH_HOME/storages`. */
export const GROUP_STORAGE_FILE = 'workspace-organize-groups.json'

/** Request body cap: group documents are tiny; 1 MiB is generous. */
export const MAX_DOCUMENT_BYTES = 1_000_000

/** Cap on stored groups; a document above it is rejected rather than trimmed. */
export const MAX_GROUPS = 200

/** Cap on the Workspaces one group may hold. */
export const MAX_MEMBERS_PER_GROUP = 500

/** One named group of Workspaces, in display order. */
export interface WorkspaceGroup {
  /** Stable opaque group id, unique inside the document. */
  id: string
  /** Operator-facing name. */
  name: string
  /** Member Workspace ids, in the order the group lists them. */
  workspaceIds: string[]
}

/** The whole persisted document. */
export interface GroupDocument {
  /** Format version; the only version this plugin writes. */
  version: 1
  /** Groups in display order. */
  groups: WorkspaceGroup[]
}

/** The document a fresh install starts from. */
export function emptyGroupDocument(): GroupDocument {
  return { version: 1, groups: [] }
}

/** A non-empty string no longer than `limit` characters. */
function isBoundedId(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
}

/**
 * Validate and normalize one group document from the wire or from disk.
 *
 * Unknown extra fields are dropped, so a document written by a later version
 * still loads; a malformed one is rejected whole rather than partially applied.
 * @param raw - parsed JSON body or file content.
 * @returns the normalized document, or `null` when the shape is invalid.
 */
export function normalizeGroupDocument(raw: unknown): GroupDocument | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const groups = (raw as { groups?: unknown }).groups
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) return null
  const seen = new Set<string>()
  const out: WorkspaceGroup[] = []
  for (const group of groups) {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) return null
    const { id, name, workspaceIds } = group as Record<string, unknown>
    if (!isBoundedId(id, 128) || typeof name !== 'string' || name.length > 200) return null
    if (seen.has(id)) return null
    seen.add(id)
    if (!Array.isArray(workspaceIds) || workspaceIds.length > MAX_MEMBERS_PER_GROUP) return null
    if (!workspaceIds.every(member => isBoundedId(member, 128))) return null
    out.push({ id, name, workspaceIds: [...workspaceIds] })
  }
  return { version: 1, groups: out }
}
