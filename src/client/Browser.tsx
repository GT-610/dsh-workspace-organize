/**
 * The grouped browser: group > workspace > session, rendered in place of the
 * shipped `sidebar.workspaces` region.
 *
 * Presentation is the shipped one — the same row metrics, the same design
 * tokens, and the shipped `Icon*`, `StateDot`, `Menu` and `Modal` primitives, so
 * menus keep the shared blur and transparency and dialogs keep the shared mask,
 * focus handling and layering. The row rules and roll-ups themselves live in
 * `select.ts`; the aggregation this tree needs — the per-Workspace row maps, the
 * roll-up booleans and the row-key walk — lives here, beside the state it reads.
 */
import {
  AnimatedRows,
  IconArchiveOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconCloseFillRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenOutlineRegular,
  IconFolderOpenRegular,
  IconNewChatOutlineRegular,
  IconProjectAddOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconTrashOutlineRegular,
  IconTriangleRightFillRegular,
  IconUnarchiveOutlineRegular,
  Menu,
  StateDot,
  Tooltip,
  type MenuEntry,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { SessionActivity } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { WorkspaceGroup } from '../shared/contract.ts'
import type { OrganizeBrowserProps } from './contract.ts'
import { asWorkspaceId } from './contract.ts'
import { DialogHost, dialogKey, type Dialog } from './dialogs.tsx'
import {
  loadArchivedFilter,
  loadExpansion,
  loadGroupDocument,
  newGroupId,
  pruneExpansion,
  saveArchivedFilter,
  saveExpansion,
  saveGroupDocument,
  type ExpansionState,
  type SaveOutcome,
} from './groups.ts'
import { messagesFrom } from './i18n.ts'
import {
  contentSessionIds,
  groupRollUp,
  mainSessionId,
  rowStatus,
  runningSubagentCount,
  sessionShown,
  timeLabel,
  unownedSessionIds,
  visibleSessionIds,
  type ArchivedFilter,
  type SessionSelection,
} from './select.ts'
import { STYLES } from './styles.ts'

/** One open row menu: where it points and what each row does. */
interface OpenMenu {
  /** Row the menu belongs to, so its trailing actions stay visible while open. */
  rowKey: string
  /** Viewport point the card hangs from. */
  at: { x: number; y: number }
  /** Data rows for the shipped `Menu`. */
  items: MenuEntry[]
  /** Row id to its action; a submenu parent has no entry. */
  actions: Readonly<Record<string, () => void>>
  /** Row shown as selected, for a menu whose rows are options. */
  selectedId?: string | undefined
}

/** One row menu's content, built at open time from live state. */
interface MenuSpec {
  items: MenuEntry[]
  actions: Record<string, () => void>
  /** Row shown as selected, for a menu whose rows are options. */
  selectedId?: string
}

/** Inline indent for one row, consumed by the shared row padding rule. */
function indent(depth: number): CSSProperties {
  return { '--dsh-workspace-indent': `${depth * 16}px` } as CSSProperties
}

/**
 * The running work a Host archive refusal reported, if that is what failed.
 *
 * The Host answers `workspace/session-active` when a Session still has a turn,
 * subagent, job, or schedule running, and names the families in the error
 * details. The shipped browser asks before stopping them; doing the same here is
 * why the refusal is read rather than retried blindly.
 * @param error - the rejection from `archiveSession`.
 * @returns the activity list, or `undefined` for any other failure.
 */
function activeSessionRefusal(error: unknown): readonly SessionActivity[] | undefined {
  if (!(error instanceof Error) || error.name !== 'WorkspaceArchiveError') return undefined
  const rpc = (error as Error & {
    rpcError?: { code?: string; details?: { activity?: readonly SessionActivity[] } }
  }).rpcError
  return rpc?.code === 'workspace/session-active' ? rpc.details?.activity ?? [] : undefined
}

/**
 * Disclosure key of the bucket for Sessions no Workspace accounts for.
 *
 * Deliberately outside the `g:` and `ws:` id spaces: the bucket has no id of its
 * own, and a key that borrowed one could outlive the Workspace it named.
 */
const UNOWNED_KEY = 'u:unowned'

/**
 * Render the grouped Workspace browser.
 * @param props - runtime shares plus the injected official operations.
 * @returns the browsing region.
 */
export function GroupedBrowser(props: OrganizeBrowserProps) {
  const { wide, expandSidebar, services, t } = props
  const { useWorkspaces, useSessions, useSessionStatus } = props
  // Built on every render: the bound `t` keeps a stable identity across a
  // language switch, so memoizing on it would keep the previous language.
  const messages = messagesFrom(t)

  // The standard kit hands out selector HOOKS (bound observable sources), not
  // raw sources: call them directly, exactly like the shipped browser.
  const workspaceSnapshot = useWorkspaces(snapshot => snapshot)
  const list = useSessions(snapshot => snapshot)
  const statuses = useSessionStatus(snapshot => snapshot)
  const panelActive = props.usePanelInfo(info => info.activePanelId !== null)

  const workspaces = workspaceSnapshot.items
  /** The title the shipped browser shows for one Workspace. */
  const workspaceLabel = (workspace: { title: string }): string =>
    workspaceDisplayTitle(workspace.title, messages.defaultWorkspace)
  const workspaceReady = workspaceSnapshot.phase === 'ready' && workspaceSnapshot.state !== 'loading'
  // `pending` is a catalog that has not arrived yet, and an absent row proves
  // nothing while it is on the way: the phase is monotone, so `ready` is when an
  // empty `ids` finally means "there truly are none".
  const sessionReady = list.phase === 'ready'
  const archived = useMemo(
    () => new Set<SessionId>(workspaceSnapshot.archivedSessionIds),
    [workspaceSnapshot.archivedSessionIds],
  )

  const [groups, setGroups] = useState<WorkspaceGroup[] | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // Explicit disclosure choices per node key. An absent key means "follow the
  // default": workspaces rest collapsed — except the one holding the current
  // Session — and groups rest open, which is what keeps the tree from opening
  // as a wall of session rows.
  const [expansion, setExpansion] = useState<ExpansionState>(loadExpansion)
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>(loadArchivedFilter)
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined)
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [hostSaved, setHostSaved] = useState(true)
  const [saveFailed, setSaveFailed] = useState(false)
  /** Why the last write was refused, when the Host said. */
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  /** The search field focuses when the header magnifier opens it. */
  const searchInput = useRef<HTMLInputElement | null>(null)
  /**
   * The client's write chain: each save starts after the previous one settles.
   *
   * The Host serializes the writes it receives in arrival order, which is not the
   * order the operator made the edits: two POSTs racing each other can commit an
   * older document last, and a version-stamped document does not exist to reject
   * the stale one. Issuing one save at a time is what makes the stored document
   * the newest edit rather than whichever request won the race — and because the
   * answers then arrive in edit order, the last one is the state to show.
   */
  const writeTail = useRef<Promise<SaveOutcome>>(Promise.resolve({ ok: true }))
  /** Newest document, kept for the retry control after a refused save. */
  const lastDocument = useRef<WorkspaceGroup[] | undefined>(undefined)
  /**
   * Whether the stored document has arrived.
   *
   * A ref, not state, because `persist` must read it without changing identity:
   * an edit that lands before the load resolves would otherwise POST a document
   * built on an empty `currentGroups` and replace every stored group with it.
   */
  const loadedRef = useRef(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void loadGroupDocument().then((doc) => {
      if (!live) return
      lastDocument.current = doc.groups
      // Set before the state update: the next event may already persist.
      loadedRef.current = true
      setGroups(doc.groups)
    })
    return () => { live = false }
  }, [])

  // The field stays mounted so its width/opacity can transition; focus follows
  // the open state instead of `autoFocus` (which only fires at mount).
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus({ preventScroll: true })
  }, [searchOpen])

  // Row timestamps bucket against a slowly advancing clock, not per render.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const persist = useCallback((next: WorkspaceGroup[]) => {
    // An edit made while the document is still loading cannot be applied
    // safely: it would overwrite the stored groups it has not seen yet.
    if (!loadedRef.current) return
    lastDocument.current = next
    setGroups(next)
    setHostSaved(false)
    setSaveFailed(false)
    setSaveError(undefined)
    const run = writeTail.current.then(() => saveGroupDocument({ version: 1, groups: next }))
    writeTail.current = run
    // Only the newest queued save reports: an earlier answer says nothing about
    // the edit still waiting behind it, and clearing the indicator on it would
    // claim a write that has not happened yet.
    void run.then((result) => {
      if (writeTail.current !== run) return
      setHostSaved(result.ok)
      setSaveFailed(!result.ok)
      setSaveError(result.ok ? undefined : result.detail)
    })
  }, [])

  /** Re-send the newest document after the Host refused it. */
  const retrySave = useCallback(() => {
    const next = lastDocument.current
    if (next !== undefined) persist(next)
  }, [persist])

  /**
   * Drop members whose Workspace no longer exists.
   *
   * The tree drops them in memory and this effect does not write: it runs off a
   * snapshot the operator did not edit, and the Host copy is what a reload reads
   * back, so an automatic write here would race every deliberate edit. The stale
   * ids therefore stay in the stored document until the next edit, which
   * persists the list this effect has already pruned.
   */
  useEffect(() => {
    if (!workspaceReady || groups === undefined) return
    const known = new Set<string>(workspaces.map(workspace => workspace.workspaceId))
    setGroups((current) => {
      if (current === undefined) return current
      let changed = false
      const next = current.map((group) => {
        const kept = group.workspaceIds.filter(id => known.has(id))
        if (kept.length === group.workspaceIds.length) return group
        changed = true
        return { ...group, workspaceIds: kept }
      })
      return changed ? next : current
    })
    // The boolean, not `groups`: the document itself is read through the
    // functional update below, so an edit does not rerun this pruning.
  }, [workspaceReady, workspaces, groups !== undefined])

  const normalizedQuery = query.trim().toLowerCase()

  // One array for "the groups that exist right now": `undefined` distinguishes
  // "the document is still loading" from "the operator has no groups", and every
  // derivation below reads the latter.
  const currentGroups = useMemo<WorkspaceGroup[]>(() => groups ?? [], [groups])

  const groupedIds = useMemo(
    () => new Set(currentGroups.flatMap(group => group.workspaceIds)),
    [currentGroups],
  )
  const ungrouped = useMemo(
    () => workspaces.filter(workspace => !groupedIds.has(workspace.workspaceId)),
    [workspaces, groupedIds],
  )
  const workspaceById = useMemo(
    () => new Map<string, (typeof workspaces)[number]>(workspaces.map(workspace => [workspace.workspaceId, workspace])),
    [workspaces],
  )
  // Candidate destinations per Workspace, derived once so a workspace menu does
  // not rescan every group each time it opens.
  const destinationsByWorkspace = useMemo(() => {
    const out = new Map<string, WorkspaceGroup[]>()
    for (const workspace of workspaces) {
      out.set(
        workspace.workspaceId,
        currentGroups.filter(group => !group.workspaceIds.includes(workspace.workspaceId)),
      )
    }
    return out
  }, [currentGroups, workspaces])

  /**
   * Move one Workspace into a group, whichever group held it before.
   *
   * One pass over the document, so the destination and the source cannot both
   * claim the Workspace, and every candidate destination shares this one
   * implementation instead of rebuilding the document per submenu row.
   * @param workspaceId - the Workspace to move.
   * @param targetGroupId - the group that should list it.
   */
  const moveWorkspace = useCallback((workspaceId: string, targetGroupId: string): void => {
    persist(currentGroups.map(group => ({
      ...group,
      workspaceIds: [
        ...group.workspaceIds.filter(id => id !== workspaceId),
        ...(group.id === targetGroupId ? [workspaceId] : []),
      ],
    })))
  }, [currentGroups, persist])

  // The session the main view currently retains. A docked panel takes focus
  // away, so the active-folder tint drops while one is open; blank-row
  // visibility does not depend on that, or opening a panel would reshuffle the
  // tree.
  const main = useMemo(() => mainSessionId(list), [list])
  const currentSessionId = panelActive ? undefined : main
  const activeWorkspaceId = useMemo(() => {
    if (currentSessionId === undefined) return undefined
    return workspaces.find(workspace => workspace.sessionIds.includes(currentSessionId))?.workspaceId
  }, [currentSessionId, workspaces])

  /**
   * Whether one Session counts as running to its row and its group.
   *
   * The unified status is authoritative once it has an entry; otherwise the
   * summary's running flag stands in. A Session whose own turn is idle but whose
   * subagents still run is running too — the shipped browser counts that as
   * ongoing.
   */
  const isRunning = useCallback((sessionId: SessionId): boolean => {
    const status = statuses.get(sessionId)
    return (status?.running ?? list.byId[sessionId]?.running) === true
      || status?.pendingInteraction !== undefined
      || runningSubagentCount(list, sessionId, statuses) > 0
  }, [list, statuses])

  // Sessions no Workspace accounts for. The shipped browser trails them in its
  // own `Ungrouped` bucket, which disappears with the browser this entry
  // shadows: without a bucket of our own such a Session has no row anywhere,
  // even though it opens, runs and archives like any other.
  const unowned = useMemo(
    () => unownedSessionIds(
      list,
      workspaces,
      main,
      archived,
      normalizedQuery,
      archivedFilter,
      messages.untitled,
    ),
    [list, workspaces, main, archived, normalizedQuery, archivedFilter, messages.untitled],
  )

  /**
   * Whether the bucket has a row under any query and any archive filter.
   *
   * Liveness cannot read `unowned`: that derivation folds the search and the
   * archive filter in, so a typed query narrows it to nothing — and pruning on
   * that would throw away the operator's explicit fold choice for a bucket that
   * is still there. This asks the unfiltered question instead: does the catalog
   * hold a Session no Workspace owns at all? `show` hides no row the row rule
   * keeps, so it is the widest view the bucket can ever have.
   */
  const hasUnowned = useMemo(
    () => unownedSessionIds(list, workspaces, main, archived, '', 'show').length > 0,
    [list, workspaces, main, archived],
  )

  /**
   * Whether the archived-only view holds an unowned row at all.
   *
   * `unowned` folds the search in, so it cannot answer that: a query matching
   * no archived row would read as "the archive is empty". This asks the same
   * derivation with the query cleared.
   */
  const unownedArchived = useMemo(
    () => unownedSessionIds(list, workspaces, main, archived, '', 'only').length > 0,
    [list, workspaces, main, archived],
  )

  const persistExpansion = useCallback((next: ExpansionState) => {
    setExpansion(next)
    saveExpansion(next)
  }, [])

  // A stored disclosure choice outlives the node it describes, so a deleted group
  // or workspace would leave its key in the mirror forever. The tree only knows
  // the live keys once both snapshots have arrived — including the session
  // catalog, whose rows are what make the unowned bucket live at all.
  useEffect(() => {
    if (!workspaceReady || !sessionReady || groups === undefined) return
    const live = new Set<string>()
    for (const group of groups) live.add(`g:${group.id}`)
    for (const workspace of workspaces) live.add(`ws:${workspace.workspaceId}`)
    // The bucket's key lives as long as the bucket can hold a row, so a search
    // that happens to hide every one of them does not discard the operator's
    // choice; with no unowned Session at all the key is pruned like any other
    // key whose node is gone. Reading the catalog's own `ready` gate above is
    // what keeps an unarrived catalog from looking like that absence — and an
    // empty catalog that *is* ready still prunes.
    if (hasUnowned) live.add(UNOWNED_KEY)
    const next = pruneExpansion(expansion, live)
    if (next !== expansion) persistExpansion(next)
  }, [workspaceReady, sessionReady, groups, workspaces, hasUnowned, expansion, persistExpansion])

  const chooseArchivedFilter = useCallback((next: ArchivedFilter) => {
    setArchivedFilter(next)
    saveArchivedFilter(next)
  }, [])

  const setExpanded = (key: string, value: boolean): void => {
    persistExpansion({ ...expansion, [key]: value })
  }

  /**
   * Whether a node renders its children. A search forces everything open so
   * matches are reachable, and so does the archived-only filter, for the same
   * reason; otherwise an explicit choice wins and the fallback covers the
   * untouched default.
   */
  const isExpanded = (key: string, fallback: boolean): boolean => {
    if (normalizedQuery !== '' || archivedFilter === 'only') return true
    const explicit = expansion[key]
    return explicit === undefined ? fallback : explicit
  }

  /** The visible-session derivation input for one Workspace. */
  const selectFor = useCallback((workspace: SessionSelection['workspace']): SessionSelection => ({
    list,
    workspace,
    main,
    archived,
    query: normalizedQuery,
    archivedFilter,
    untitled: messages.untitled,
  }), [list, main, archived, normalizedQuery, archivedFilter, messages.untitled])

  // Every Workspace's rows, derived once per snapshot instead of once per render
  // site: the tree needs the visible list, the group header needs the content
  // count, and group-level operations need the same content list again.
  const visibleByWorkspace = useMemo(() => {
    const out = new Map<string, SessionId[]>()
    for (const workspace of workspaces) out.set(workspace.workspaceId, visibleSessionIds(selectFor(workspace)))
    return out
  }, [workspaces, selectFor])

  /**
   * The sessions a group-level operation may act on, per Workspace.
   *
   * Deliberately independent of the current search and archive filter: the
   * confirmation counts exactly what the operation will touch, so archiving a
   * group while a search is typed cannot promise three rows and archive ten.
   */
  const contentByWorkspace = useMemo(() => {
    const out = new Map<string, SessionId[]>()
    for (const workspace of workspaces) {
      out.set(workspace.workspaceId, contentSessionIds({
        list,
        workspace,
        main,
        archived,
        query: '',
        archivedFilter: 'default',
      }))
    }
    return out
  }, [workspaces, list, main, archived])

  /** The visible rows of one Workspace, already derived for this render. */
  const visibleOf = (workspaceId: string): SessionId[] => visibleByWorkspace.get(workspaceId) ?? []

  /** Every live member of one group, before the archived-only filter. */
  const groupMembers = (group: WorkspaceGroup) =>
    group.workspaceIds.map(id => workspaceById.get(id)).filter(member => member !== undefined)

  /** The members the current view lists: the archive filter drops empty ones. */
  const shownGroupMembers = (group: WorkspaceGroup) => {
    const all = groupMembers(group)
    return archivedFilter === 'only'
      ? all.filter(member => visibleOf(member.workspaceId).length > 0)
      : all
  }

  /** Whether a workspace row is expanded in the current view. */
  const workspaceOpen = (workspace: (typeof workspaces)[number]): boolean =>
    isExpanded(`ws:${workspace.workspaceId}`, workspace.workspaceId === activeWorkspaceId)

  /** The sessions a group-level operation may act on, already derived. */
  const contentOf = (workspaceId: string): SessionId[] => contentByWorkspace.get(workspaceId) ?? []

  // Whether any row would render at all. Only the archived-only filter needs it:
  // an install with nothing archived must say so once, rather than repeat the
  // same line under every Workspace. The unowned bucket is a row site too, or an
  // archive holding only unowned Sessions would read as empty.
  const hasVisibleContent = archivedFilter !== 'only'
    || unowned.length > 0
    || workspaces.some(workspace => visibleOf(workspace.workspaceId).length > 0)

  // Whether the archived-only view would have a row to show if the search were
  // cleared. Two traps live here: `visibleOf` folds the query in, so a query
  // that matches no archived row would read as "nothing is archived"; and
  // membership alone is not enough either, since a row the catalog does not
  // carry, or a spent blank, never renders. Asking the renderer's own predicate
  // keeps the empty state from contradicting the tree it sits in.
  const hasArchived = unownedArchived || workspaces.some(workspace =>
    workspace.sessionIds.some(sessionId =>
      sessionShown(list.byId[sessionId], sessionId, main, archived, 'only')))

  /**
   * Archive one Session, asking before anything running is stopped.
   *
   * The Host refuses to archive a Session with running work and reports what is
   * running. That refusal is the only case worth a second attempt, and the
   * attempt stops real work: it goes through the confirmation dialog, never
   * through a blind retry that would make a transient failure stop a turn.
   * @param sessionId - the Session to archive.
   */
  const archiveOne = (sessionId: SessionId): void => {
    void services.archiveSession(sessionId).catch((error) => {
      const activity = activeSessionRefusal(error)
      if (activity === undefined) {
        console.warn('workspace-organize: archive refused', sessionId, error)
        return
      }
      const row = list.byId[sessionId]
      // A refusal can arrive after the operator opened another dialog; keep
      // that newer dialog instead of replacing it with this older request.
      setDialog(current => current ?? {
        kind: 'archiveSession',
        sessionId,
        title: row?.title ?? row?.displayTitle ?? '',
        activity,
      })
    })
  }

  /**
   * Restore one Session from the archive.
   *
   * The same shape as {@link archiveOne} because the two verbs sit in the same
   * row and fail the same way: the Host can refuse either, and a rejection left
   * unhandled would surface as an unhandled rejection instead of a report.
   * @param sessionId - the Session to restore.
   */
  const restoreOne = (sessionId: SessionId): void => {
    void services.unarchiveSession(sessionId)
      .catch(error => console.warn('workspace-organize: restore refused', sessionId, error))
  }

  /**
   * Open a row menu at a viewport point.
   *
   * The gesture is claimed on `contextmenu`, never on mousedown, so that it
   * composes with whatever else is installed instead of racing it: a
   * context-menu plugin that has already claimed the row stops the event during
   * the document capture phase, our handler never runs, and that plugin's menu
   * is the only one on screen. Opening on mousedown would step around that
   * arbitration and stack two menus on every right-click.
   */
  const openMenu = (rowKey: string, spec: MenuSpec, at: { x: number; y: number }): void => {
    setMenu({ rowKey, at, items: spec.items, actions: spec.actions, selectedId: spec.selectedId })
  }

  /** Right-click wiring for one row. */
  const menuProps = (rowKey: string, spec: () => MenuSpec) => ({
    onContextMenu: (event: React.MouseEvent): void => {
      event.preventDefault()
      openMenu(rowKey, spec(), { x: event.clientX, y: event.clientY })
    },
  })

  /** Anchor under a button rather than at the pointer. */
  const openMenuUnder = (rowKey: string, spec: MenuSpec, button: HTMLElement): void => {
    const rect = button.getBoundingClientRect()
    openMenu(rowKey, spec, { x: rect.left, y: rect.bottom + 4 })
  }

  /**
   * One session row.
   * @param sessionId - the Session to render.
   * @param depth - indent level, in 16px steps.
   * @param level - `aria-level` of the row; sessions sit one step below the node
   * that lists them, which is a Workspace — or the unowned bucket.
   */
  const sessionRow = (sessionId: SessionId, depth: number, level = 3) => {
    const row = list.byId[sessionId]
    if (row === undefined) return null
    // The one visible blank is a placeholder, not a conversation: it shows the
    // localized New Session label instead of its directory-derived title, and it
    // carries no verbs — renaming, forking, or archiving it would all act on
    // content that does not exist yet.
    const isBlank = row.blank
    const isArchived = archived.has(sessionId)
    // The shipped row title: the durable title, or the localized Untitled label
    // — never the directory-derived `displayTitle` fallback.
    const title = isBlank ? messages.blankSession : row.title || messages.untitled
    const status = rowStatus(
      statuses,
      sessionId,
      messages,
      row.running,
      runningSubagentCount(list, sessionId, statuses),
    )
    const key = `s:${sessionId}`
    const open = (): void => { if (!isArchived) services.openSession(sessionId) }
    const rename = (): void => setDialog({ kind: 'renameSession', sessionId, current: row.title ?? '' })
    const spec = (): MenuSpec => ({
      items: [
        isArchived
          ? { id: 'unarchive', label: messages.unarchive, icon: <IconUnarchiveOutlineRegular /> }
          : { id: 'archive', label: messages.archiveSession, icon: <IconArchiveOutlineRegular /> },
        { id: 'rename', label: messages.renameSession, icon: <IconEditOutlineRegular /> },
      ],
      actions: {
        archive: () => archiveOne(sessionId),
        unarchive: () => restoreOne(sessionId),
        rename,
      },
    })
    return (
      <div
        key={key}
        className={`dwo-row dwo-session-row${isArchived ? ' archived' : ''}${menu?.rowKey === key ? ' menu-open' : ''}`}
        // The shipped rows' DOM contract, so third-party integrations (row
        // menus, hit testing, automation) resolve this row the same way they
        // resolve the browser it replaces.
        role="treeitem"
        data-row-key={`session:${sessionId}`}
        aria-level={level}
        aria-selected={currentSessionId === sessionId}
        aria-description={isArchived ? messages.archivedNotOpenable : undefined}
        style={indent(depth)}
        tabIndex={0}
        onClick={open}
        onKeyDown={(event) => {
          // A child button owns its own Enter/Space; never let the row swallow
          // the activation.
          if (event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        }}
        onDoubleClick={isBlank ? undefined : rename}
        // A placeholder has no menu to offer, but its right-click is still
        // claimed so the platform menu never appears over the tree.
        {...(isBlank ? { onContextMenu: (event: React.MouseEvent) => event.preventDefault() } : menuProps(key, spec))}
      >
        <span className="dwo-slot">
          {!isArchived && !isBlank && status.state !== 'idle' ? <StateDot state={status.state} /> : null}
        </span>
        <span className="dwo-row-title">{title}</span>
        {!isBlank && (
          <span className="dwo-time">{status.trailing ?? timeLabel(row.updatedAt, now, messages)}</span>
        )}
        {!isBlank && (
          <span className="dwo-actions">
            <Tooltip label={isArchived ? messages.unarchive : messages.archiveSession} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
                aria-label={isArchived ? messages.unarchive : messages.archiveSession}
                onClick={(event) => {
                  event.stopPropagation()
                  if (isArchived) restoreOne(sessionId)
                  else archiveOne(sessionId)
                }}
              >
                {isArchived ? <IconUnarchiveOutlineRegular size={16} /> : <IconArchiveOutlineRegular size={16} />}
              </button>
            </Tooltip>
          </span>
        )}
      </div>
    )
  }

  const workspaceRow = (workspace: (typeof workspaces)[number], depth: number) => {
    const ids = visibleOf(workspace.workspaceId)
    const key = `ws:${workspace.workspaceId}`
    const label = workspaceLabel(workspace)
    // Workspaces start collapsed — only the one holding the current session
    // opens, which is the shipped browser's own resting shape.
    const isOpen = workspaceOpen(workspace)
    const others = destinationsByWorkspace.get(workspace.workspaceId) ?? []
    // Only a grouped Workspace can leave a group. Offering the entry on an
    // ungrouped row would name an operation that cannot change anything: the
    // Workspace is in no group to be removed from.
    const grouped = groupedIds.has(workspace.workspaceId)
    const spec = (): MenuSpec => {
      const items: MenuItem[] = [
        { id: 'rename', label: messages.renameWorkspace, icon: <IconEditOutlineRegular /> },
        { id: 'newSession', label: messages.newSession, icon: <IconProjectAddOutlineRegular /> },
      ]
      if (others.length > 0) {
        items.push({
          id: 'move',
          label: messages.moveToGroup,
          icon: <IconFolderOpenRegular />,
          submenu: others.map(group => ({ id: `move:${group.id}`, label: group.name })),
        })
      }
      if (grouped) {
        items.push({ id: 'remove', label: messages.removeFromGroup, icon: <IconFolderOpenOutlineRegular /> })
      }
      items.push({ id: 'delete', label: messages.deleteWorkspace, icon: <IconTrashOutlineRegular />, danger: true })
      const actions: Record<string, () => void> = {
        rename: () => setDialog({ kind: 'renameWorkspace', workspaceId: workspace.workspaceId, current: label }),
        newSession: () => services.startSession(workspace.workspaceId),
        remove: () => persist(currentGroups.map(group => ({
          ...group,
          workspaceIds: group.workspaceIds.filter(id => id !== workspace.workspaceId),
        }))),
        delete: () => setDialog({ kind: 'deleteWorkspace', workspaceId: workspace.workspaceId }),
      }
      // One entry per candidate group, addressed by the submenu row id.
      for (const target of others) {
        actions[`move:${target.id}`] = () => moveWorkspace(workspace.workspaceId, target.id)
      }
      return { items, actions }
    }
    return (
      <div key={workspace.workspaceId} className="dwo-ws-node">
        <div
          className={`dwo-row dwo-ws-row${menu?.rowKey === key ? ' menu-open' : ''}`}
          role="treeitem"
          data-row-key={`workspace:${workspace.workspaceId}`}
          aria-level={2}
          aria-expanded={isOpen}
          style={indent(depth)}
          tabIndex={0}
          onClick={() => setExpanded(key, !isOpen)}
          onKeyDown={(event) => {
            // A child button owns its own Enter/Space.
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setExpanded(key, !isOpen)
          }}
          {...menuProps(key, spec)}
        >
          <span className={`dwo-slot dwo-folder${activeWorkspaceId === workspace.workspaceId ? ' active' : ''}`}>
            {isOpen ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
          </span>
          <span className="dwo-slot dwo-chev">
            <span className={`dwo-arrow${isOpen ? ' open' : ''}`}><IconTriangleRightFillRegular size={14} /></span>
          </span>
          <span className="dwo-text">
            <span className="dwo-row-title">{label}</span>
          </span>
          <span className="dwo-actions">
            <Tooltip label={messages.workspaceMenu} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
                aria-label={messages.workspaceMenu}
                onClick={(event) => {
                  event.stopPropagation()
                  openMenuUnder(key, spec(), event.currentTarget)
                }}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            </Tooltip>
            <Tooltip label={messages.newSession} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
                aria-label={messages.newSession}
                onClick={(event) => {
                  event.stopPropagation()
                  services.startSession(workspace.workspaceId)
                }}
              >
                <IconNewChatOutlineRegular size={14} />
              </button>
            </Tooltip>
          </span>
        </div>
        {isOpen && (
          <div className="dwo-ws-sessions">
            {ids.length === 0
              ? (
                  <div className="dwo-empty" style={{ marginLeft: (depth + 1) * 16 }}>
                    {normalizedQuery === '' ? messages.noSessions : messages.noMatches}
                  </div>
                )
              : ids.map(id => sessionRow(id, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const groupNode = (group: WorkspaceGroup, depth: number) => {
    const key = `g:${group.id}`
    // Groups hold no sessions of their own, so they rest open: the noise a wall
    // of identical session rows caused came from workspaces, not here.
    const isOpen = isExpanded(key, true)
    const allMembers = groupMembers(group)
    // The archived-only view drops Workspaces with no archived row, as the
    // shipped browser does. Membership and the group operations still read the
    // unfiltered list: the filter changes what is shown, never what a group
    // holds.
    const members = shownGroupMembers(group)
    // The count and the confirmation use the same derivation as the operation
    // itself, so the number promised is the number archived.
    const content = allMembers.flatMap(member => contentOf(member.workspaceId))
    const stopIds = content.filter(isRunning)
    const { running, pending } = groupRollUp(allMembers, list, statuses, archived)
    const state = pending > 0 ? 'warning' : running > 0 ? 'ongoing' : undefined
    const summary = [`${allMembers.length} ${messages.unitWorkspaces}`]
    if (running > 0) summary.push(`${running} ${messages.unitRunning}`)
    const rollUpTitle = [
      `${allMembers.length} ${messages.unitWorkspaces}`,
      ...(running > 0 ? [`${running} ${messages.unitRunning}`] : []),
      ...(pending > 0 ? [`${pending} ${messages.unitPending}`] : []),
    ].join(' · ')
    const spec = (): MenuSpec => ({
      items: [
        { id: 'rename', label: messages.renameGroup, icon: <IconEditOutlineRegular /> },
        { id: 'archive', label: messages.archiveGroup, icon: <IconArchiveOutlineRegular /> },
        { id: 'newGroup', label: messages.newGroup, icon: <IconProjectAddOutlineRegular /> },
        {
          id: 'deleteWorkspaces',
          label: messages.deleteGroupWorkspaces,
          icon: <IconTrashOutlineRegular />,
          danger: true,
        },
        { id: 'ungroup', label: messages.ungroup, icon: <IconFolderOpenOutlineRegular />, danger: true },
      ],
      actions: {
        rename: () => setDialog({ kind: 'renameGroup', groupId: group.id, current: group.name }),
        archive: () => setDialog({
          kind: 'archiveGroup',
          groupId: group.id,
          targets: content,
          running: stopIds.length,
          stopIds,
        }),
        newGroup: () => setDialog({ kind: 'createGroup' }),
        deleteWorkspaces: () => setDialog({
          kind: 'deleteGroupWorkspaces',
          groupId: group.id,
          workspaceIds: allMembers.map(member => member.workspaceId),
        }),
        ungroup: () => persist(currentGroups.filter(current => current.id !== group.id)),
      },
    })
    return (
      <div key={group.id} className="dwo-group-node">
        <div
          className={`dwo-row dwo-group-row${menu?.rowKey === key ? ' menu-open' : ''}`}
          role="treeitem"
          data-row-key={`group:${group.id}`}
          aria-level={1}
          aria-expanded={isOpen}
          style={indent(depth)}
          tabIndex={0}
          onClick={() => setExpanded(key, !isOpen)}
          onKeyDown={(event) => {
            // A child button owns its own Enter/Space.
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setExpanded(key, !isOpen)
          }}
          {...menuProps(key, spec)}
        >
          <span className="dwo-slot dwo-chev">
            <span className={`dwo-arrow${isOpen ? ' open' : ''}`}><IconTriangleRightFillRegular size={14} /></span>
          </span>
          <span className="dwo-text">
            <span className="dwo-row-title dwo-group-title">{group.name}</span>
          </span>
          <span className="dwo-count" title={rollUpTitle}>
            {state === undefined ? null : <StateDot state={state} size={10} />}
            <span>{summary.join(' · ')}</span>
          </span>
          <span className="dwo-actions">
            <Tooltip label={messages.groupMenu} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
                aria-label={messages.groupMenu}
                onClick={(event) => {
                  event.stopPropagation()
                  openMenuUnder(key, spec(), event.currentTarget)
                }}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            </Tooltip>
          </span>
        </div>
        {isOpen && (
          <div>
            {members.length === 0
              ? <div className="dwo-empty" style={{ marginLeft: (depth + 1) * 16 }}>{messages.emptyGroup}</div>
              : members.map(member => workspaceRow(member, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  /**
   * The bucket holding Sessions no Workspace accounts for.
   *
   * It rests open. A folded bucket would hide exactly the rows it exists to
   * reveal, and there is no Workspace row above it to open first — the operator
   * has nothing to click but this header — so the disclosure only ever closes
   * it on purpose. Search and the archived-only filter force it open like every
   * other node.
   * @param ids - the bucket's visible rows, already in render order.
   * @returns the bucket node, or nothing when it holds no row.
   */
  const unownedNode = (ids: readonly SessionId[]) => {
    if (ids.length === 0) return null
    const isOpen = isExpanded(UNOWNED_KEY, true)
    return (
      <div key={UNOWNED_KEY} className="dwo-group-node">
        <div
          className="dwo-row dwo-group-row"
          role="treeitem"
          data-row-key="unowned"
          aria-level={1}
          aria-expanded={isOpen}
          style={indent(0)}
          tabIndex={0}
          onClick={() => setExpanded(UNOWNED_KEY, !isOpen)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setExpanded(UNOWNED_KEY, !isOpen)
          }}
          // The bucket offers no menu, but its right-click is still claimed so
          // the platform menu never appears over the tree — the same contract
          // every other row of this browser follows.
          onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
        >
          <span className="dwo-slot dwo-chev">
            <span className={`dwo-arrow${isOpen ? ' open' : ''}`}><IconTriangleRightFillRegular size={14} /></span>
          </span>
          <span className="dwo-text">
            <span className="dwo-row-title dwo-group-title">{messages.ungroupedSessions}</span>
          </span>
          <span className="dwo-count">{`${ids.length} ${messages.unitSessions}`}</span>
        </div>
        {isOpen && (
          <div className="dwo-ws-sessions">
            {ids.map(id => sessionRow(id, 1, 2))}
          </div>
        )}
      </div>
    )
  }

  /**
   * Archive the sessions a group confirmation counted.
   *
   * The target list is frozen when the dialog opens, so a session that appears
   * or disappears while the dialog is up cannot change what the operator
   * confirmed. A session that refuses because it started running in the
   * meantime is skipped, not stopped: only the sessions counted as running at
   * open time were offered for stop-and-archive.
   * @param targets - the sessions the confirmation counted.
   * @param stopIds - the targets whose running work the operator agreed to stop.
   */
  const confirmArchiveGroup = async (
    targets: readonly SessionId[],
    stopIds: readonly SessionId[],
  ): Promise<void> => {
    const allowedToStop = new Set(stopIds)
    setBusy(true)
    try {
      for (const sessionId of targets) {
        try {
          await services.archiveSession(sessionId)
        } catch (error) {
          if (activeSessionRefusal(error) === undefined || !allowedToStop.has(sessionId)) {
            console.warn('workspace-organize: archive refused', sessionId, error)
            continue
          }
          await services.archiveSession(sessionId, { stopActivity: true })
            .catch(retry => console.warn('workspace-organize: archive refused', sessionId, retry))
        }
      }
    } finally {
      setBusy(false)
      setDialog(undefined)
    }
  }

  /**
   * Delete exactly the Workspaces the confirmation counted.
   * @param groupId - group removed from the document once the deletes settle.
   * @param workspaceIds - Workspace ids frozen at open time.
   */
  const confirmDeleteGroupWorkspaces = async (
    groupId: string,
    workspaceIds: readonly string[],
  ): Promise<void> => {
    setBusy(true)
    try {
      for (const workspaceId of workspaceIds) {
        await services.deleteWorkspace(asWorkspaceId(workspaceId))
          .catch(error => console.warn('workspace-organize: delete failed', workspaceId, error))
      }
      persist(currentGroups.filter(candidate => candidate.id !== groupId))
    } finally {
      setBusy(false)
      setDialog(undefined)
    }
  }

  /** Apply the dialog the operator confirmed. */
  async function submitDialog(current: Dialog, name: string): Promise<void> {
    switch (current.kind) {
      case 'createGroup':
      case 'renameGroup': {
        const trimmed = name.trim()
        if (trimmed !== '') {
          if (current.kind === 'createGroup') persist([...currentGroups, { id: newGroupId(), name: trimmed, workspaceIds: [] }])
          else persist(currentGroups.map(group => (group.id === current.groupId ? { ...group, name: trimmed } : group)))
        }
        setDialog(undefined)
        return
      }
      case 'renameWorkspace': {
        const trimmed = name.trim()
        // An unchanged title is confirmed on purpose: the shipped dialog lets it
        // pin an automatic title, so skipping it would keep that out of reach.
        if (trimmed !== '') {
          await services.renameWorkspace(current.workspaceId, trimmed)
            .catch(error => console.warn('workspace-organize: rename failed', error))
        }
        setDialog(undefined)
        return
      }
      case 'renameSession': {
        const trimmed = name.trim()
        if (trimmed !== '') {
          await services.renameSession(current.sessionId, trimmed)
            .catch(error => console.warn('workspace-organize: session rename failed', error))
        }
        setDialog(undefined)
        return
      }
      case 'archiveGroup':
        await confirmArchiveGroup(current.targets, current.stopIds)
        return
      case 'deleteGroupWorkspaces':
        await confirmDeleteGroupWorkspaces(current.groupId, current.workspaceIds)
        return
      case 'archiveSession':
        await services.archiveSession(current.sessionId, { stopActivity: true })
        setDialog(undefined)
        return
      case 'deleteWorkspace': {
        await services.deleteWorkspace(current.workspaceId)
          .catch(error => console.warn('workspace-organize: delete failed', error))
        setDialog(undefined)
        return
      }
    }
  }
  const addWorkspace = (): void => {
    void services.pickDirectory().then((path) => {
      if (path === null || path === '') return undefined
      // The shipped flow adopts the directory and opens its Session; leaving
      // the operator on an empty new Workspace row is not the same action.
      return services.createWorkspace({ path }).then((workspace) => {
        services.startSession(workspace.workspaceId)
      })
    }).catch(error => console.warn('workspace-organize: add workspace failed', error))
  }

  /** Pin every node open or shut, overwriting earlier per-node choices. */
  const setAllExpanded = (value: boolean): void => {
    const next: Record<string, boolean> = {}
    for (const group of groups ?? []) next[`g:${group.id}`] = value
    for (const workspace of workspaces) next[`ws:${workspace.workspaceId}`] = value
    // The bucket is folded like any other node whenever it can hold a row, even
    // while the current search hides every one of them.
    if (hasUnowned) next[UNOWNED_KEY] = value
    persistExpansion(next)
  }

  const viewMenu: MenuSpec = {
    items: [
      // Nothing may be persisted before the stored document arrives.
      { id: 'newGroup', label: messages.newGroup, icon: <IconProjectAddOutlineRegular />, disabled: groups === undefined },
      { id: 'expandAll', label: messages.expandAll, icon: <IconChevronsUpDownOutlineRegular /> },
      { id: 'collapseAll', label: messages.collapseAll, icon: <IconChevronsUpDownOutlineRegular /> },
      { type: 'separator', id: 'archived-separator' },
      { id: 'hideArchived', label: messages.hideArchived },
      { id: 'showArchived', label: messages.showArchived },
      { id: 'onlyArchived', label: messages.onlyArchived },
    ],
    actions: {
      newGroup: () => setDialog({ kind: 'createGroup' }),
      expandAll: () => setAllExpanded(true),
      collapseAll: () => setAllExpanded(false),
      hideArchived: () => chooseArchivedFilter('default'),
      showArchived: () => chooseArchivedFilter('show'),
      onlyArchived: () => chooseArchivedFilter('only'),
    },
    selectedId: archivedFilter === 'default'
      ? 'hideArchived'
      : archivedFilter === 'show' ? 'showArchived' : 'onlyArchived',
  }

  const pendingLoad = groups === undefined || !workspaceReady

  // The archived-only view lists the archive, not the whole tree: a Workspace
  // with no archived row is dropped, exactly as the shipped browser drops it.
  const onlyArchived = archivedFilter === 'only'
  const listedGroups = onlyArchived
    ? currentGroups.filter(group => group.workspaceIds.some(id => visibleOf(id).length > 0))
    : currentGroups
  const listedUngrouped = onlyArchived
    ? ungrouped.filter(workspace => visibleOf(workspace.workspaceId).length > 0)
    : ungrouped

  /**
   * The rail is the sidebar's folded state: two icon controls that ask the shell
   * to expand, and no tree. Rendering the browser here would put the whole tree
   * in a 56px column.
   */
  if (!wide) {
    return (
      <div className="dwo-browse rail">
        <style>{STYLES}</style>
        <div className="dwo-header">
          <Tooltip label={messages.addWorkspace} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className="dwo-icon-btn"
              aria-label={messages.addWorkspace}
              onClick={() => {
                expandSidebar()
                addWorkspace()
              }}
            >
              <IconProjectAddOutlineRegular size={18} />
            </button>
          </Tooltip>
        </div>
        <div className="dwo-rail-search">
          <Tooltip label={messages.search} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className="dwo-icon-btn dwo-search-btn"
              aria-label={messages.search}
              onClick={() => {
                expandSidebar()
                setSearchOpen(true)
              }}
            >
              <IconSearchOutlineRegular size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
    )
  }

  // Keys of every row the tree renders, in DOM order. `AnimatedRows` matches
  // them to the rows' `data-row-key`, so membership animations and the tree
  // cannot disagree about which rows are on screen.
  const rowKeys: string[] = []
  for (const group of listedGroups) {
    rowKeys.push(`group:${group.id}`)
    if (!isExpanded(`g:${group.id}`, true)) continue
    for (const member of shownGroupMembers(group)) {
      rowKeys.push(`workspace:${member.workspaceId}`)
      if (!workspaceOpen(member)) continue
      for (const id of visibleOf(member.workspaceId)) rowKeys.push(`session:${id}`)
    }
  }
  for (const workspace of listedUngrouped) {
    rowKeys.push(`workspace:${workspace.workspaceId}`)
    if (!workspaceOpen(workspace)) continue
    for (const id of visibleOf(workspace.workspaceId)) rowKeys.push(`session:${id}`)
  }
  if (unowned.length > 0) {
    rowKeys.push('unowned')
    if (isExpanded(UNOWNED_KEY, true)) for (const id of unowned) rowKeys.push(`session:${id}`)
  }
  // View changes replace the list rather than animating across it.
  const animationResetKey = `${archivedFilter}/${normalizedQuery}`

  return (
    <div className="dwo-browse">
      <style>{STYLES}</style>
      <div className="dwo-header">
        <span className={`dwo-head-label${searchOpen ? ' hidden' : ''}`}>{messages.organizeTitle}</span>
        <div className={`dwo-search-slot${searchOpen ? ' open' : ''}`}>
          <div
            className={`dwo-search${searchOpen ? ' open' : ''}`}
            onClick={() => {
              setSearchOpen(true)
              searchInput.current?.focus({ preventScroll: true })
            }}
          >
            <Tooltip label={messages.search} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-icon-btn dwo-search-btn"
                aria-label={messages.search}
                aria-expanded={searchOpen}
                onClick={(event) => {
                  event.stopPropagation()
                  setSearchOpen(true)
                  searchInput.current?.focus({ preventScroll: true })
                }}
              >
                <IconSearchOutlineRegular size={searchOpen ? 11 : 14} />
              </button>
            </Tooltip>
            <input
              ref={searchInput}
              className="dwo-search-input"
              tabIndex={searchOpen ? 0 : -1}
              placeholder={messages.search}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false)
                  setQuery('')
                }
              }}
            />
            {searchOpen && (
              <Tooltip label={messages.closeSearch} side="bottom" align="end" delayMs={500} portal>
                <button
                  type="button"
                  className="dwo-search-clear"
                  aria-label={messages.closeSearch}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSearchOpen(false)
                    setQuery('')
                  }}
                >
                  <IconCloseFillRegular size={12} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        <div className={`dwo-head-actions${searchOpen ? ' hidden' : ''}`}>
          <Tooltip label={messages.viewOptions} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className="dwo-icon-btn"
              aria-label={messages.viewOptions}
              onClick={(event) => {
                event.stopPropagation()
                openMenuUnder('view', viewMenu, event.currentTarget)
              }}
            >
              <IconSlidersTwoOutlineRegular size={16} />
            </button>
          </Tooltip>
          <Tooltip label={messages.addWorkspace} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className="dwo-icon-btn"
              aria-label={messages.addWorkspace}
              onClick={addWorkspace}
            >
              <IconProjectAddOutlineRegular size={16} />
            </button>
          </Tooltip>
          {!hostSaved && !saveFailed && <span className="dwo-saving" title={messages.savePending}>…</span>}
          {saveFailed && (
            <Tooltip
              label={saveError === undefined ? messages.saveFailed : `${messages.saveFailed} ${saveError}`}
              side="bottom"
              align="end"
              delayMs={500}
              portal
            >
              <button
                type="button"
                className="dwo-icon-btn dwo-save-failed"
                aria-label={messages.retrySave}
                onClick={retrySave}
              >
                !
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {pendingLoad
        ? <div className="dwo-empty">{messages.loading}</div>
        : archivedFilter === 'only' && !hasVisibleContent
          ? (
              <div className="dwo-tree-body">
                <AnimatedRows
                  className="dwo-list"
                  role="tree"
                  label={messages.organizeTitle}
                  rowKeys={[]}
                  ready={sessionReady}
                  resetKey={animationResetKey}
                >
                  <div className="dwo-empty">
                    {/* An empty archive and a query that misses are different
                        facts, and the row below has to name the right one. */}
                    {hasArchived ? messages.noMatches : messages.archivedOnlyEmpty}
                    {!hasArchived && (
                      <>
                        {' '}
                        {/* The way back is the shipped browser's "view other
                            sessions": an ordinary view. With an empty archive
                            `default` and `show` render the same rows, so there
                            is nothing for `show` to add. */}
                        <button
                          type="button"
                          className="dwo-empty-link"
                          onClick={() => chooseArchivedFilter('default')}
                        >
                          {messages.viewOtherSessions}
                        </button>
                      </>
                    )}
                  </div>
                </AnimatedRows>
                <span className="dwo-fade" aria-hidden="true" />
              </div>
            )
          : (
              <div className="dwo-tree-body">
                <AnimatedRows
                  className="dwo-list"
                  role="tree"
                  label={messages.organizeTitle}
                  rowKeys={rowKeys}
                  ready={sessionReady}
                  resetKey={animationResetKey}
                >
                  {listedGroups.map(group => groupNode(group, 0))}
                  {listedGroups.length > 0 && listedUngrouped.length > 0 && (
                    <div className="dwo-sep">{messages.ungroupedWorkspaces}</div>
                  )}
                  {listedUngrouped.map(workspace => workspaceRow(workspace, 0))}
                  {unownedNode(unowned)}
                  {listedGroups.length === 0 && listedUngrouped.length === 0 && unowned.length === 0 && (
                    <div className="dwo-empty">{messages.noWorkspaces}</div>
                  )}
                </AnimatedRows>
                <span className="dwo-fade" aria-hidden="true" />
              </div>
            )}
      {menu !== undefined && (
        <Menu
          open
          portal
          // A zero-size point the card hangs from; `getAnchorRect` below is what
          // actually places it, so this anchor only has to exist.
          anchor={<span style={{ position: 'fixed', left: menu.at.x, top: menu.at.y }} />}
          getAnchorRect={() => new DOMRect(menu.at.x, menu.at.y, 0, 0)}
          items={menu.items}
          selectedId={menu.selectedId}
          onSelect={(id) => {
            setMenu(undefined)
            menu.actions[id]?.()
          }}
          onClose={() => setMenu(undefined)}
        />
      )}
      {dialog !== undefined && (
        <DialogHost
          key={dialogKey(dialog)}
          dialog={dialog}
          busy={busy}
          messages={messages}
          close={() => setDialog(undefined)}
          submit={name => submitDialog(dialog, name)}
        />
      )}
    </div>
  )

}

