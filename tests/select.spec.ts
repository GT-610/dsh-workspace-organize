/**
 * The pure derivations, tested against the official snapshot shapes.
 *
 * These cover the rules that are easy to get subtly wrong and expensive to
 * notice: which blank sessions may render, what a group counts, and how a row's
 * leading dot resolves.
 */
import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatus, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { messages } from '../src/client/i18n.ts'
import {
  contentSessionIds,
  groupRollUp,
  mainSessionId,
  relativeTime,
  rowStatus,
  sessionShown,
  timeLabel,
  unownedSessionIds,
  visibleSessionIds,
  type ArchivedFilter,
  type SessionSelection,
} from '../src/client/select.ts'

const id = (value: string): SessionId => value as SessionId

/** One list row with the fields the derivations read. */
function row(value: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: id(value),
    displayTitle: value,
    running: false,
    blank: false,
    updatedAt: 0,
    retainedBy: {},
    ...overrides,
  } as SessionSummary
}

/** A list snapshot from rows, in the order given. */
function list(rows: readonly SessionSummary[]): SessionListState {
  return {
    ids: rows.map(entry => entry.id),
    byId: Object.fromEntries(rows.map(entry => [entry.id, entry])),
  } as unknown as SessionListState
}

/** One workspace over the sessions it accounts for. */
function workspace(title: string, members: readonly string[]): WorkspaceView {
  return {
    workspaceId: title,
    path: `C:/repos/${title}`,
    title,
    sessionIds: members.map(id),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorkspaceView
}

/** A selection over one workspace. */
function selection(
  sessions: SessionListState,
  target: WorkspaceView,
  query = '',
  archived: readonly string[] = [],
  archivedFilter: ArchivedFilter = 'default',
): SessionSelection {
  const archiveSet = new Set(archived.map(id))
  return { list: sessions, workspace: target, main: mainSessionId(sessions), archived: archiveSet, query, archivedFilter }
}

/** A status snapshot from per-session facts. */
function statuses(entries: Readonly<Record<string, Partial<SessionStatus>>>): SessionStatusSnapshot {
  const map = new Map<SessionId, SessionStatus>()
  for (const [key, value] of Object.entries(entries)) {
    map.set(id(key), {
      running: undefined,
      pendingInteraction: undefined,
      completionUnread: false,
      ...value,
    } as SessionStatus)
  }
  return map
}

describe('sessionShown', () => {
  it('hides every blank session except the one the main view holds', () => {
    const current = row('current', { blank: true, retainedBy: { mainView: 1 } as SessionSummary['retainedBy'] })
    const spent = row('spent', { blank: true })
    const real = row('real')
    const sessions = list([current, spent, real])
    const main = mainSessionId(sessions)
    expect(main).toBe('current')
    expect(sessionShown(current, current.id, main, new Set())).toBe(true)
    expect(sessionShown(spent, spent.id, main, new Set())).toBe(false)
    expect(sessionShown(real, real.id, main, new Set())).toBe(true)
  })

  it('hides an archived row and a row the catalog does not carry', () => {
    const archivedRow = row('gone')
    expect(sessionShown(archivedRow, archivedRow.id, undefined, new Set([id('gone')]))).toBe(false)
    expect(sessionShown(undefined, id('missing'), undefined, new Set())).toBe(false)
  })

  it('follows the archived filter instead of always hiding', () => {
    const archivedRow = row('gone')
    const archiveSet = new Set([id('gone')])
    expect(sessionShown(archivedRow, archivedRow.id, undefined, archiveSet, 'show')).toBe(true)
    expect(sessionShown(archivedRow, archivedRow.id, undefined, archiveSet, 'only')).toBe(true)
    expect(sessionShown(row('live'), id('live'), undefined, archiveSet, 'only')).toBe(false)
  })

  it('hides a subagent child, which its parent header shows instead', () => {
    const child = row('child', { origin: 'subagent', parentId: id('named') })
    expect(sessionShown(child, child.id, undefined, new Set())).toBe(false)
    // Origin is the first rule, exactly as in the shipped derivation: not even a
    // retained child — or the archived filter — can bring a child row back.
    expect(sessionShown(child, child.id, child.id, new Set(), 'show')).toBe(false)
    expect(sessionShown(child, child.id, undefined, new Set([child.id]), 'only')).toBe(false)
  })

  it('keeps the visible placeholder unless the view asks for archived rows alone', () => {
    // The shipped `sessionVisible` applies the archived filter last, so the
    // placeholder shows under `default` and `show` and drops out of `only` —
    // the archived-only view holds archived rows and nothing else.
    const current = row('current', { blank: true, retainedBy: { mainView: 1 } as SessionSummary['retainedBy'] })
    expect(sessionShown(current, current.id, current.id, new Set(), 'default')).toBe(true)
    expect(sessionShown(current, current.id, current.id, new Set(), 'show')).toBe(true)
    expect(sessionShown(current, current.id, current.id, new Set(), 'only')).toBe(false)
  })
})

describe('visibleSessionIds', () => {
  const current = row('blank-current', { blank: true, retainedBy: { mainView: 1 } as SessionSummary['retainedBy'] })
  const spent = row('blank-spent', { blank: true })
  const named = row('named')
  const sessions = list([current, spent, named])
  const target = workspace('repo', ['named', 'spent', 'blank-current'])

  it('keeps the retained placeholder, drops spent drafts, and leads with the placeholder', () => {
    expect(visibleSessionIds(selection(sessions, target))).toEqual(['blank-current', 'named'])
  })

  it('never matches a blank placeholder to a query', () => {
    expect(visibleSessionIds(selection(sessions, target, 'blank'))).toEqual([])
    expect(visibleSessionIds(selection(sessions, target, 'nam'))).toEqual(['named'])
  })

  it('drops archived members outside the search path', () => {
    expect(visibleSessionIds(selection(sessions, target, '', ['named']))).toEqual(['blank-current'])
  })

  it('separates rows that hold content from the placeholder', () => {
    expect(contentSessionIds(selection(sessions, target))).toEqual(['named'])
  })

  it('leaves a subagent child out of the listing and out of the content count', () => {
    // A child is shown by its parent's header, so it is neither a row of its own
    // nor something a group-level archive may act on.
    const child = row('child', { origin: 'subagent' })
    const withChild = list([named, child])
    const childWorkspace = workspace('repo', ['named', 'child'])
    const childSelection = selection(withChild, childWorkspace)
    expect(visibleSessionIds(childSelection)).toEqual(['named'])
    expect(contentSessionIds(childSelection)).toEqual(['named'])
  })
})

describe('archived-row visibility', () => {
  const current = row('blank-current', { blank: true, retainedBy: { mainView: 1 } as SessionSummary['retainedBy'] })
  const named = row('named')
  const gone = row('gone')
  const sessions = list([current, named, gone])
  const target = workspace('repo', ['named', 'gone', 'blank-current'])

  it('trails archived rows behind the live ones when the filter shows them', () => {
    const shown = visibleSessionIds(selection(sessions, target, '', ['gone'], 'show'))
    expect(shown).toEqual(['blank-current', 'named', 'gone'])
  })

  it('lists only archived rows under the archived-only filter', () => {
    const only = visibleSessionIds(selection(sessions, target, '', ['gone'], 'only'))
    expect(only).toEqual(['gone'])
  })

  it('keeps an archived row searchable while the filter shows it', () => {
    expect(visibleSessionIds(selection(sessions, target, 'gon', ['gone'], 'show'))).toEqual(['gone'])
    expect(visibleSessionIds(selection(sessions, target, 'gon', ['gone'], 'default'))).toEqual([])
  })

  it('never counts an archived row as content, even while it is displayed', () => {
    expect(contentSessionIds(selection(sessions, target, '', ['gone'], 'show'))).toEqual(['named'])
    expect(contentSessionIds(selection(sessions, target, '', ['gone'], 'only'))).toEqual([])
  })

  it('hides the placeholder from an archived-only view', () => {
    expect(visibleSessionIds(selection(sessions, target, '', [], 'only'))).toEqual([])
  })

  it('trails an archived match behind a live one in search results', () => {
    // Both match, and the archived row sits first in membership order: the
    // live one still has to render first.
    const older = row('older-archived', { displayTitle: 'weekly report' })
    const newer = row('newer-live', { displayTitle: 'weekly report' })
    const both = list([older, newer])
    const ordered = workspace('repo', ['older-archived', 'newer-live'])
    const matched = visibleSessionIds(selection(both, ordered, 'report', ['older-archived'], 'show'))
    expect(matched).toEqual(['newer-live', 'older-archived'])
  })
})

describe('unownedSessionIds', () => {
  const current = row('blank-current', {
    blank: true,
    retainedBy: { mainView: 1 } as SessionSummary['retainedBy'],
    updatedAt: 50,
  })
  const spent = row('blank-spent', { blank: true, updatedAt: 90 })
  const oldest = row('loose-old', { displayTitle: 'Alpha note', updatedAt: 10 })
  const newest = row('loose-new', { displayTitle: 'Beta note', updatedAt: 80 })
  const tied = row('loose-tied', { displayTitle: 'Gamma note', updatedAt: 80 })
  const owned = row('owned', { displayTitle: 'Owned note', updatedAt: 70 })
  const gone = row('loose-archived', { displayTitle: 'Delta note', updatedAt: 95 })
  const sessions = list([current, spent, oldest, newest, tied, owned, gone])
  const target = workspace('repo', ['owned'])
  // `gone` is archived throughout, so a case that wants it on screen asks for a
  // filter that shows archived rows rather than pretending it is live.
  const unowned = (
    query = '',
    archivedFilter: ArchivedFilter = 'default',
  ): readonly string[] => unownedSessionIds(
    sessions,
    [target],
    mainSessionId(sessions),
    new Set([id('loose-archived')]),
    query,
    archivedFilter,
  )

  it('lists only the sessions no workspace accounts for, newest first', () => {
    // `owned` belongs to the workspace, the spent draft is not a row at all, and
    // the two 80ms rows fall back to session identity.
    expect(unowned()).toEqual(['blank-current', 'loose-new', 'loose-tied', 'loose-old'])
  })

  it('matches a query on the title, and never on a blank placeholder', () => {
    expect(unowned('beta')).toEqual(['loose-new'])
    expect(unowned('note')).toEqual(['loose-new', 'loose-tied', 'loose-old'])
    // The placeholder's canonical title is a directory name, so it is excluded
    // from search exactly like the workspace listing excludes it.
    expect(unowned('blank')).toEqual([])
  })

  it('follows the archived filter, trailing archived rows behind live ones', () => {
    // `loose-archived` is the newest row of all: recency alone would put it
    // first, so this also proves the partitions survive the ordering.
    expect(unowned('', 'show'))
      .toEqual(['blank-current', 'loose-new', 'loose-tied', 'loose-old', 'loose-archived'])
    expect(unowned('', 'only')).toEqual(['loose-archived'])
    expect(unowned('', 'default')).not.toContain('loose-archived')
  })

  it('is empty when every session has a workspace', () => {
    expect(unownedSessionIds(list([owned]), [target], undefined, new Set(), '')).toEqual([])
  })

  it('leaves a subagent child out of the bucket', () => {
    const child = row('loose-child', { origin: 'subagent', updatedAt: 60 })
    expect(unownedSessionIds(list([child, owned]), [target], undefined, new Set(), '')).toEqual([])
  })
})

describe('groupRollUp', () => {
  const members = [workspace('a', ['run', 'wait', 'done']), workspace('b', ['archived-run'])]
  const snapshot = statuses({
    run: { running: true },
    wait: { pendingInteraction: { kind: 'approval' } as SessionStatus['pendingInteraction'] },
    done: { completionUnread: true },
    'archived-run': { running: true },
  })

  it('counts running and waiting members and ignores archived rows', () => {
    expect(groupRollUp(members, snapshot, new Set([id('archived-run')]))).toEqual({ running: 1, pending: 1 })
  })

  it('counts a session with an unknown status as neither', () => {
    expect(groupRollUp([workspace('c', ['unknown'])], snapshot, new Set())).toEqual({ running: 0, pending: 0 })
  })
})

describe('rowStatus', () => {
  it('prefers a pending interaction over running, running over unread, else idle', () => {
    const snapshot = statuses({
      waiting: { running: true, pendingInteraction: { kind: 'question' } as SessionStatus['pendingInteraction'] },
      running: { running: true, completionUnread: true },
      unread: { completionUnread: true },
      quiet: {},
    })
    expect(rowStatus(snapshot, id('waiting'), messages)).toEqual({ state: 'warning', trailing: messages.statusQuestion })
    expect(rowStatus(snapshot, id('running'), messages)).toEqual({ state: 'ongoing' })
    expect(rowStatus(snapshot, id('unread'), messages)).toEqual({ state: 'done' })
    expect(rowStatus(snapshot, id('quiet'), messages)).toEqual({ state: 'idle' })
    expect(rowStatus(snapshot, id('absent'), messages)).toEqual({ state: 'idle' })
  })

  it('keeps the warning dot and leaves the timestamp for a kind it cannot label', () => {
    const snapshot = statuses({ odd: { pendingInteraction: { kind: 'invented' } as SessionStatus['pendingInteraction'] } })
    expect(rowStatus(snapshot, id('odd'), messages)).toEqual({ state: 'warning' })
  })
})

describe('relativeTime and timeLabel', () => {
  const now = 1_000_000_000_000

  it('buckets each magnitude', () => {
    expect(relativeTime(now - 30_000, now)).toEqual({ unit: 'now', n: 0 })
    expect(relativeTime(now - 5 * 60_000, now)).toEqual({ unit: 'minutes', n: 5 })
    expect(relativeTime(now - 5 * 3_600_000, now)).toEqual({ unit: 'hours', n: 5 })
    expect(relativeTime(now - 5 * 86_400_000, now)).toEqual({ unit: 'days', n: 5 })
    expect(relativeTime(now - 70 * 86_400_000, now)).toEqual({ unit: 'months', n: 2 })
    expect(relativeTime(now - 800 * 86_400_000, now)).toEqual({ unit: 'years', n: 2 })
  })

  it('never reports a future moment as negative', () => {
    expect(relativeTime(now + 60_000, now)).toEqual({ unit: 'now', n: 0 })
  })

  it('localizes the bucket', () => {
    expect(timeLabel(now - 5 * 3_600_000, now, messages)).toBe(messages.timeHours(5))
    expect(timeLabel(now, now, messages)).toBe(messages.timeNow)
  })
})
