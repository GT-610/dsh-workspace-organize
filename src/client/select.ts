/**
 * Pure derivations over the official snapshots.
 *
 * Nothing here touches React or the Cordis context: every function takes the
 * snapshots it reads and returns plain data, which is what makes the visible-row
 * rule, the group roll-up, and the time buckets testable without mounting the
 * browser. `Browser.tsx` holds the only state, and `index.tsx` the only wiring.
 */
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { Messages, TimeBucket } from './i18n.ts'

/** State a row's leading dot can be in, in the shipped primitive's vocabulary. */
export type RowState = 'idle' | 'warning' | 'ongoing' | 'done'

/**
 * Archived-row visibility, in the shipped vocabulary: hide them, show them
 * beside the rest, or show nothing but them.
 */
export type ArchivedFilter = 'default' | 'show' | 'only'

/** One row's leading dot plus the text that replaces its timestamp. */
export interface RowStatus {
  /** Which dot to paint. */
  state: RowState
  /** Short status text for the trailing cell; absent when the timestamp stands. */
  trailing?: string
}

/**
 * The session the main view currently retains.
 *
 * This is the shipped tree's own `mainSessionId`, and it is also the only blank
 * session allowed a row: every other blank is a spent provisional draft.
 * @param list - sessions list snapshot.
 * @returns the retained session's id, or `undefined` when none is retained.
 */
export function mainSessionId(list: SessionListState): SessionId | undefined {
  return Object.values(list.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
}

/**
 * Whether one session renders as a row at all.
 *
 * Ordinary sessions do. A blank one is a provisional New Session that nothing
 * has been sent to yet, and the shipped derivation (`sessionVisible` in
 * ui-workspace's `tree.ts`) keeps exactly one: the one the main view holds.
 * Every other blank stays out of the list — those are the drafts left behind by
 * earlier "new session" clicks, and rendering them put a row named after each
 * workspace's directory in the tree.
 *
 * Archived rows follow the filter, exactly as they do in the shipped browser:
 * hidden by default, shown beside the rest, or shown alone.
 * @param row - the session's list row, when the catalog has it.
 * @param id - the session id being tested.
 * @param main - the retained session id.
 * @param archived - registry-global archive set.
 * @param archivedFilter - archived-row visibility choice.
 * @returns whether the session belongs in the tree.
 */
export function sessionShown(
  row: SessionSummary | undefined,
  id: SessionId,
  main: SessionId | undefined,
  archived: ReadonlySet<SessionId>,
  archivedFilter: ArchivedFilter = 'default',
): boolean {
  if (row === undefined) return false
  if (row.blank && id !== main) return false
  switch (archivedFilter) {
    case 'default': return !archived.has(id)
    case 'show': return true
    case 'only': return archived.has(id)
  }
}

/** What one list derivation reads. */
export interface SessionSelection {
  /** Sessions list snapshot. */
  list: SessionListState
  /** The Workspace whose members are being listed. */
  workspace: WorkspaceView
  /** The retained session id, from {@link mainSessionId}. */
  main: SessionId | undefined
  /** Registry-global archive set. */
  archived: ReadonlySet<SessionId>
  /** Trimmed, lower-cased search query; empty lists everything. */
  query: string
  /** Archived-row visibility choice; omitted hides them. */
  archivedFilter?: ArchivedFilter
}

/**
 * The sessions one Workspace shows, in render order.
 *
 * A blank placeholder never matches a query: its canonical title is the
 * directory name, so matching it would tie search to one language. The
 * surviving placeholder leads its Workspace, matching the order
 * `sectionMembers` gives placeholders in the shipped tree. Archived rows trail
 * the live ones, which is where the shipped manual order keeps them.
 * @param selection - the snapshots and query to read.
 * @returns visible session ids, placeholder first.
 */
export function visibleSessionIds(selection: SessionSelection): SessionId[] {
  const { list, workspace, main, archived, query, archivedFilter = 'default' } = selection
  const ids = workspace.sessionIds
    .filter(id => sessionShown(list.byId[id], id, main, archived, archivedFilter))
  if (query !== '') {
    return ids.filter((id) => {
      const row = list.byId[id]
      if (row === undefined || row.blank) return false
      return row.displayTitle.toLowerCase().includes(query)
    })
  }
  const leading: SessionId[] = []
  const live: SessionId[] = []
  const spent: SessionId[] = []
  for (const id of ids) {
    if (id === main) leading.push(id)
    else if (archived.has(id)) spent.push(id)
    else live.push(id)
  }
  return [...leading, ...live, ...spent]
}

/**
 * Visible rows that actually hold something.
 *
 * The blank placeholder is excluded, and so is an archived row even while the
 * archive filter shows it: group counts and the group-archive confirmation must
 * agree on what "a session in this group" is, and an archived one is already
 * out of the way.
 * @param selection - the snapshots and query to read.
 * @returns visible non-blank, non-archived session ids.
 */
export function contentSessionIds(selection: SessionSelection): SessionId[] {
  return visibleSessionIds(selection).filter((id) => {
    const row = selection.list.byId[id]
    return row !== undefined && !row.blank && !selection.archived.has(id)
  })
}

/** Copy key for each pending-interaction kind the shipped rows label. */
const PENDING_COPY: Readonly<Record<string, 'statusApproval' | 'statusPlanReview' | 'statusQuestion'>> = {
  approval: 'statusApproval',
  'plan-review': 'statusPlanReview',
  question: 'statusQuestion',
}

/**
 * One row's status.
 *
 * A pending interaction outranks running, which outranks a finished-but-unread
 * completion — the same precedence the shipped status dots use. A pending kind
 * this plugin has no copy for keeps the warning dot and leaves the timestamp in
 * place rather than printing a raw kind.
 * @param statuses - unified UI status snapshot.
 * @param id - the session to read.
 * @param messages - copy for the pending label.
 * @returns the dot state and optional trailing label.
 */
export function rowStatus(
  statuses: SessionStatusSnapshot,
  id: SessionId,
  messages: Messages,
): RowStatus {
  const status = statuses.get(id)
  if (status === undefined) return { state: 'idle' }
  if (status.pendingInteraction !== undefined) {
    const key = PENDING_COPY[status.pendingInteraction.kind]
    return key === undefined ? { state: 'warning' } : { state: 'warning', trailing: messages[key] }
  }
  if (status.running === true) return { state: 'ongoing' }
  if (status.completionUnread) return { state: 'done' }
  return { state: 'idle' }
}

/** How much of a group is moving, and how much is waiting on the operator. */
export interface GroupRollUp {
  /** Sessions running right now, archived rows excluded. */
  running: number
  /** Sessions blocked on a user interaction, archived rows excluded. */
  pending: number
}

/**
 * Roll member Workspaces up into one group status.
 *
 * A group holds no sessions of its own, so its dot and count come from the
 * members. Archived rows are already out of the way and never counted.
 * @param members - the group's live member Workspaces.
 * @param statuses - unified UI status snapshot.
 * @param archived - registry-global archive set.
 * @returns running and pending session counts.
 */
export function groupRollUp(
  members: readonly WorkspaceView[],
  statuses: SessionStatusSnapshot,
  archived: ReadonlySet<SessionId>,
): GroupRollUp {
  let running = 0
  let pending = 0
  for (const member of members) {
    for (const id of member.sessionIds) {
      if (archived.has(id)) continue
      const status = statuses.get(id)
      if (status === undefined) continue
      if (status.pendingInteraction !== undefined) pending += 1
      else if (status.running === true) running += 1
    }
  }
  return { running, pending }
}

/**
 * Compact relative-time bucketing, shared with the shipped rows so two surfaces
 * dating the same session never disagree.
 * @param at - epoch ms of the dated moment.
 * @param now - current epoch ms.
 * @returns the bucket plus its magnitude (0 for "now").
 */
export function relativeTime(at: number, now: number): { unit: TimeBucket; n: number } {
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const diff = Math.max(0, now - at)
  if (diff < MIN) return { unit: 'now', n: 0 }
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) }
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) }
  if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) }
  if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) }
  return { unit: 'years', n: Math.floor(diff / (365 * DAY)) }
}

/**
 * One row's timestamp label.
 * @param at - epoch ms the row was last updated.
 * @param now - current epoch ms.
 * @param messages - copy for the bucket.
 * @returns the localized, bucketed label.
 */
export function timeLabel(at: number, now: number, messages: Messages): string {
  const { unit, n } = relativeTime(at, now)
  switch (unit) {
    case 'now': return messages.timeNow
    case 'minutes': return messages.timeMinutes(n)
    case 'hours': return messages.timeHours(n)
    case 'days': return messages.timeDays(n)
    case 'months': return messages.timeMonths(n)
    case 'years': return messages.timeYears(n)
  }
}
