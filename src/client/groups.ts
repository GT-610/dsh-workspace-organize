/**
 * Group document transport and view-state persistence.
 *
 * The Host route is the authority; `localStorage` mirrors both the document and
 * the disclosure choices so a page reload renders the last known tree without
 * waiting for a round trip. Nothing here throws: an unreachable Host degrades to
 * the browser-local mirror, which is exactly how a plain web install behaves.
 */
import {
  GROUP_ROUTE,
  emptyGroupDocument,
  normalizeGroupDocument,
  type GroupDocument,
} from '../shared/contract.ts'
import type { ArchivedFilter } from './select.ts'

/** Mirror key for the group document. */
export const GROUPS_STORAGE_KEY = 'workspaceOrganize.groups'

/** Mirror key for the explicit disclosure choices. */
export const EXPANSION_STORAGE_KEY = 'workspaceOrganize.expansion'

/** Mirror key for the archived-row visibility choice. */
export const ARCHIVED_FILTER_STORAGE_KEY = 'workspaceOrganize.archivedFilter'

/** Disclosure choices by node key: `g:<id>` for a group, `ws:<id>` for a workspace. */
export type ExpansionState = Readonly<Record<string, boolean>>

/** A fresh group id. Opaque and unique enough for one document. */
export function newGroupId(): string {
  return `g-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** Read the mirrored document, ignoring any malformed content. */
function mirroredDocument(): GroupDocument | undefined {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY)
    if (raw === null) return undefined
    return normalizeGroupDocument(JSON.parse(raw)) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Load the group document: the Host first, the browser mirror as a fallback.
 * @returns the stored document, or an empty one on a fresh install.
 */
export async function loadGroupDocument(): Promise<GroupDocument> {
  const fallback = mirroredDocument()
  try {
    // `no-store` because the Host answers live plugin state: a cached response
    // would render a group tree that another window has already replaced.
    const response = await fetch(GROUP_ROUTE, { cache: 'no-store' })
    if (response.ok) {
      const doc = normalizeGroupDocument(await response.json())
      if (doc !== null) return doc
    }
  } catch {
    // Unreachable Host: the mirror below is the best available answer.
  }
  return fallback ?? emptyGroupDocument()
}

/**
 * Persist the group document through the Host, mirroring it locally either way.
 * @param doc - the document to store.
 * @returns whether the Host accepted it.
 */
export async function saveGroupDocument(doc: GroupDocument): Promise<boolean> {
  try {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // Private mode: the Host copy is still authoritative.
  }
  try {
    const response = await fetch(GROUP_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Read the mirrored disclosure choices. */
export function loadExpansion(): ExpansionState {
  try {
    const raw = localStorage.getItem(EXPANSION_STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) out[key] = value === true
    return out
  } catch {
    return {}
  }
}

/**
 * Mirror the disclosure choices for the next reload.
 * @param next - the complete choice map.
 */
export function saveExpansion(next: ExpansionState): void {
  try {
    localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode: choices simply do not survive the reload.
  }
}

/**
 * Read the mirrored archived-row visibility choice.
 * @returns the stored choice, or `'default'` (hide archived rows).
 */
export function loadArchivedFilter(): ArchivedFilter {
  try {
    const raw = localStorage.getItem(ARCHIVED_FILTER_STORAGE_KEY)
    return raw === 'show' || raw === 'only' ? raw : 'default'
  } catch {
    return 'default'
  }
}

/**
 * Mirror the archived-row visibility choice for the next reload.
 * @param next - the chosen filter.
 */
export function saveArchivedFilter(next: ArchivedFilter): void {
  try {
    localStorage.setItem(ARCHIVED_FILTER_STORAGE_KEY, next)
  } catch {
    // Private mode: the choice simply does not survive the reload.
  }
}
