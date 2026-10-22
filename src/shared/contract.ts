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

/**
 * Request body cap, in bytes.
 *
 * It has to accept every document the validator below can produce, or a legal
 * edit would be refused by the route as "body too large" before validation ever
 * ran. Size is not the character count: `JSON.stringify` expands a control
 * character to `\uXXXX`, six bytes for one code unit. At the structural limits —
 * 200 group records, 2 000 members, every id and name filled with control
 * characters — the document serializes to about 1.89 MB, so this cap sits above
 * that with headroom. `contract.spec.ts` builds that document and measures it.
 */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

/** Cap on stored groups; a document above it is rejected rather than trimmed. */
export const MAX_GROUPS = 200

/** Cap on the Workspaces one group may hold. */
export const MAX_MEMBERS_PER_GROUP = 500

/** Cap on a group id or a member Workspace id, in characters. */
export const MAX_ID_LENGTH = 128

/**
 * Cap on a group name, in characters.
 *
 * The Client's group dialogs carry it as their input's `maxLength`, so an
 * operator cannot type a name the Host would reject as an invalid document —
 * a rejection the Client could only see as a save that never settles.
 */
export const MAX_GROUP_NAME_LENGTH = 200

/**
 * Cap on members across the whole document.
 *
 * A member belongs to at most one group, and every real install has far fewer
 * Workspaces than this. The cap is what keeps {@link MAX_DOCUMENT_BYTES}
 * sufficient for any document the validator accepts.
 */
export const MAX_TOTAL_MEMBERS = 2_000

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
 *
 * One normalization is worth naming: a Workspace may appear at most once in the
 * document, because a Workspace lives in one group. A repeated member is dropped
 * rather than rejected whole — the same treatment an unknown field gets — so a
 * hand-edited file with a stray duplicate still opens.
 * @param raw - parsed JSON body or file content.
 * @returns the normalized document, or `null` when the shape is invalid.
 */
export function normalizeGroupDocument(raw: unknown): GroupDocument | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const groups = (raw as { groups?: unknown }).groups
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) return null
  const seenIds = new Set<string>()
  const placed = new Set<string>()
  const out: WorkspaceGroup[] = []
  let total = 0
  for (const group of groups) {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) return null
    const { id, name, workspaceIds } = group as Record<string, unknown>
    if (!isBoundedId(id, MAX_ID_LENGTH) || typeof name !== 'string' || name.length > MAX_GROUP_NAME_LENGTH) return null
    if (seenIds.has(id)) return null
    seenIds.add(id)
    if (!Array.isArray(workspaceIds) || workspaceIds.length > MAX_MEMBERS_PER_GROUP) return null
    const members: string[] = []
    for (const member of workspaceIds) {
      if (!isBoundedId(member, MAX_ID_LENGTH)) return null
      if (placed.has(member)) continue
      placed.add(member)
      members.push(member)
    }
    total += members.length
    if (total > MAX_TOTAL_MEMBERS) return null
    out.push({ id, name, workspaceIds: members })
  }
  return { version: 1, groups: out }
}
