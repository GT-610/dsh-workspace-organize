/**
 * The grouped browser: group > workspace > session, rendered in place of the
 * shipped `sidebar.workspaces` region.
 *
 * Presentation is the shipped one — the same row metrics, the same design
 * tokens, and the shipped `Icon*`, `StateDot`, `Menu` and `Modal` primitives, so
 * menus keep the shared blur and transparency and dialogs keep the shared mask,
 * focus handling and layering. Everything derived lives in `select.ts`; this
 * file owns interaction state only.
 */
import {
  Button,
  IconArchiveOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenOutlineRegular,
  IconFolderOpenRegular,
  IconProjectAddOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconTrashOutlineRegular,
  IconTriangleRightFillRegular,
  IconUnarchiveOutlineRegular,
  Input,
  Menu,
  Modal,
  StateDot,
  Tooltip,
  type MenuEntry,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { WorkspaceGroup } from '../shared/contract.ts'
import type { OrganizeBrowserProps } from './contract.ts'
import { asWorkspaceId } from './contract.ts'
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
} from './groups.ts'
import { messages } from './i18n.ts'
import {
  contentSessionIds,
  groupRollUp,
  mainSessionId,
  rowStatus,
  sessionShown,
  timeLabel,
  visibleSessionIds,
  type ArchivedFilter,
  type SessionSelection,
} from './select.ts'
import { STYLES } from './styles.ts'

/** Which dialog is on screen, and the facts it needs. */
type Dialog =
  | { kind: 'createGroup' }
  | { kind: 'renameGroup'; groupId: string; current: string }
  | { kind: 'renameWorkspace'; workspaceId: WorkspaceId; current: string }
  | { kind: 'renameSession'; sessionId: SessionId; current: string }
  | { kind: 'archiveGroup'; groupId: string; name: string; count: number }
  | { kind: 'deleteGroupWorkspaces'; groupId: string; name: string; count: number }
  | { kind: 'deleteWorkspace'; workspaceId: WorkspaceId; title: string }

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
 * Render the grouped Workspace browser.
 * @param props - runtime shares plus the injected official operations.
 * @returns the browsing region.
 */
export function GroupedBrowser(props: OrganizeBrowserProps) {
  const { wide, services } = props
  const { useWorkspaces, useSessions, useSessionStatus } = props

  // The standard kit hands out selector HOOKS (bound observable sources), not
  // raw sources: call them directly, exactly like the shipped browser.
  const workspaceSnapshot = useWorkspaces(snapshot => snapshot)
  const list = useSessions(snapshot => snapshot)
  const statuses = useSessionStatus(snapshot => snapshot)
  const panelActive = props.usePanelInfo(info => info.activePanelId !== null)

  const workspaces = workspaceSnapshot.items
  const workspaceReady = workspaceSnapshot.phase === 'ready' && workspaceSnapshot.state !== 'loading'
  const archived = useMemo(
    () => new Set<SessionId>(workspaceSnapshot.archivedSessionIds),
    [workspaceSnapshot.archivedSessionIds],
  )

  const [groups, setGroups] = useState<WorkspaceGroup[] | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // Explicit disclosure choices per node key. An absent key means "follow the
  // default": workspaces rest collapsed and groups rest open, which is what
  // keeps the tree from opening as a wall of session rows.
  const [expansion, setExpansion] = useState<ExpansionState>(loadExpansion)
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>(loadArchivedFilter)
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined)
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [hostSaved, setHostSaved] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void loadGroupDocument().then((doc) => {
      if (live) setGroups(doc.groups)
    })
    return () => { live = false }
  }, [])

  // Row timestamps bucket against a slowly advancing clock, not per render.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const persist = useCallback((next: WorkspaceGroup[]) => {
    setGroups(next)
    setHostSaved(false)
    void saveGroupDocument({ version: 1, groups: next }).then(ok => setHostSaved(ok))
  }, [])

  // Workspace deletions elsewhere remove ids from the group document too.
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
    // `groups` is read only as the "loaded yet?" guard; including it would rerun
    // this pruning on every edit the effect itself makes.
  }, [workspaceReady, workspaces, groups])

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

  const persistExpansion = useCallback((next: ExpansionState) => {
    setExpansion(next)
    saveExpansion(next)
  }, [])

  // A stored disclosure choice outlives the node it describes, so a deleted group
  // or workspace would leave its key in the mirror forever. The tree only knows
  // the live keys once both snapshots have arrived.
  useEffect(() => {
    if (!workspaceReady || groups === undefined) return
    const live = new Set<string>()
    for (const group of groups) live.add(`g:${group.id}`)
    for (const workspace of workspaces) live.add(`ws:${workspace.workspaceId}`)
    const next = pruneExpansion(expansion, live)
    if (next !== expansion) persistExpansion(next)
  }, [workspaceReady, groups, workspaces, expansion, persistExpansion])

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
  }), [list, main, archived, normalizedQuery, archivedFilter])

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

  /** The sessions a group-level operation may act on, already derived. */
  const contentOf = (workspaceId: string): SessionId[] => contentByWorkspace.get(workspaceId) ?? []

  // Whether any row would render at all. Only the archived-only filter needs it:
  // an install with nothing archived must say so once, rather than repeat the
  // same line under every Workspace.
  const hasVisibleContent = archivedFilter !== 'only'
    || workspaces.some(workspace => visibleOf(workspace.workspaceId).length > 0)

  // Whether the archived-only view would have a row to show if the search were
  // cleared. Two traps live here: `visibleOf` folds the query in, so a query
  // that matches no archived row would read as "nothing is archived"; and
  // membership alone is not enough either, since a row the catalog does not
  // carry, or a spent blank, never renders. Asking the renderer's own predicate
  // keeps the empty state from contradicting the tree it sits in.
  const hasArchived = workspaces.some(workspace =>
    workspace.sessionIds.some(sessionId =>
      sessionShown(list.byId[sessionId], sessionId, main, archived, 'only')))

  /**
   * Archive one Session, retrying once through the stop-then-archive path.
   *
   * The Host refuses to archive a Session with running work, and that refusal is
   * the only failure worth a second attempt: the retry asks it to stop the work
   * first. Every other failure is reported and left alone.
   * @param sessionId - the Session to archive.
   */
  const archiveWithFallback = (sessionId: SessionId): Promise<void> =>
    services.archiveSession(sessionId).catch(() =>
      services.archiveSession(sessionId, { stopActivity: true }))

  const archiveOne = (sessionId: SessionId): void => {
    void archiveWithFallback(sessionId)
      .catch(error => console.warn('workspace-organize: archive refused', sessionId, error))
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

  const sessionRow = (sessionId: SessionId, depth: number) => {
    const row = list.byId[sessionId]
    if (row === undefined) return null
    // The one visible blank is a placeholder, not a conversation: it shows the
    // localized New Session label instead of its directory-derived title, and it
    // carries no verbs — renaming, forking, or archiving it would all act on
    // content that does not exist yet.
    const isBlank = row.blank
    const isArchived = archived.has(sessionId)
    const status = rowStatus(statuses, sessionId, messages)
    const key = `s:${sessionId}`
    const spec = (): MenuSpec => ({
      items: [
        isArchived
          ? { id: 'unarchive', label: messages.unarchive, icon: <IconUnarchiveOutlineRegular /> }
          : { id: 'archive', label: messages.archiveSession, icon: <IconArchiveOutlineRegular /> },
        { id: 'rename', label: messages.renameSession, icon: <IconEditOutlineRegular /> },
      ],
      actions: {
        archive: () => archiveOne(sessionId),
        unarchive: () => { void services.unarchiveSession(sessionId) },
        rename: () => setDialog({ kind: 'renameSession', sessionId, current: row.displayTitle }),
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
        aria-level={3}
        aria-selected={currentSessionId === sessionId}
        aria-description={isArchived ? messages.archivedNotOpenable : undefined}
        style={indent(depth)}
        data-session-id={sessionId}
        onClick={() => { if (!isArchived) services.openSession(sessionId) }}
        onDoubleClick={isBlank
          ? undefined
          : () => setDialog({ kind: 'renameSession', sessionId, current: row.displayTitle })}
        // A placeholder has no menu to offer, but its right-click is still
        // claimed so the platform menu never appears over the tree.
        {...(isBlank ? { onContextMenu: (event: React.MouseEvent) => event.preventDefault() } : menuProps(key, spec))}
      >
        <span className="dwo-slot">
          {!isArchived && !isBlank && status.state !== 'idle' ? <StateDot state={status.state} /> : null}
        </span>
        <span className="dwo-row-title">{isBlank ? messages.blankSession : row.displayTitle}</span>
        {!isBlank && (
          <span className="dwo-time">{status.trailing ?? timeLabel(row.updatedAt, now, messages)}</span>
        )}
        {!isBlank && (
          <span className="dwo-actions">
            <Tooltip label={isArchived ? messages.unarchive : messages.archiveSession} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  if (isArchived) void services.unarchiveSession(sessionId)
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
    // Workspaces start collapsed — only the one holding the current session
    // opens, which is the shipped browser's own resting shape.
    const isOpen = isExpanded(key, workspace.workspaceId === activeWorkspaceId)
    const others = destinationsByWorkspace.get(workspace.workspaceId) ?? []
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
      items.push(
        { id: 'remove', label: messages.removeFromGroup, icon: <IconFolderOpenOutlineRegular /> },
        { id: 'delete', label: messages.deleteWorkspace, icon: <IconTrashOutlineRegular />, danger: true },
      )
      const actions: Record<string, () => void> = {
        rename: () => setDialog({ kind: 'renameWorkspace', workspaceId: workspace.workspaceId, current: workspace.title }),
        newSession: () => services.startSession(workspace.workspaceId),
        remove: () => persist(currentGroups.map(group => ({
          ...group,
          workspaceIds: group.workspaceIds.filter(id => id !== workspace.workspaceId),
        }))),
        delete: () => setDialog({ kind: 'deleteWorkspace', workspaceId: workspace.workspaceId, title: workspace.title }),
      }
      // One entry per candidate group, addressed by the submenu row id.
      for (const target of others) {
        actions[`move:${target.id}`] = () => persist(currentGroups.map(group => ({
          ...group,
          workspaceIds: [
            ...group.workspaceIds.filter(id => id !== workspace.workspaceId),
            ...(group.id === target.id ? [workspace.workspaceId] : []),
          ],
        })))
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
          onClick={() => setExpanded(key, !isOpen)}
          {...menuProps(key, spec)}
        >
          <span className={`dwo-slot dwo-folder${activeWorkspaceId === workspace.workspaceId ? ' active' : ''}`}>
            {isOpen ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
          </span>
          <span className="dwo-slot dwo-chev">
            <span className={`dwo-arrow${isOpen ? ' open' : ''}`}><IconTriangleRightFillRegular size={14} /></span>
          </span>
          <span className="dwo-text">
            <span className="dwo-row-title">{workspace.title}</span>
          </span>
          <span className="dwo-actions">
            <Tooltip label={messages.workspaceMenu} side="bottom" align="end" delayMs={500} portal>
              <button
                type="button"
                className="dwo-act-btn"
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
                onClick={(event) => {
                  event.stopPropagation()
                  services.startSession(workspace.workspaceId)
                }}
              >
                <IconProjectAddOutlineRegular size={16} />
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
    const members = group.workspaceIds
      .map(id => workspaceById.get(id))
      .filter(member => member !== undefined)
    // The count and the confirmation use the same derivation as the operation
    // itself, so the number promised is the number archived.
    const content = members.flatMap(member => contentOf(member.workspaceId))
    const sessionCount = content.length
    const { running, pending } = groupRollUp(members, statuses, archived)
    const state = pending > 0 ? 'warning' : running > 0 ? 'ongoing' : undefined
    const summary = [`${members.length} ${messages.unitWorkspaces}`]
    if (running > 0) summary.push(`${running} ${messages.unitRunning}`)
    const rollUpTitle = [
      `${members.length} ${messages.unitWorkspaces}`,
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
          name: group.name,
          count: sessionCount,
        }),
        newGroup: () => setDialog({ kind: 'createGroup' }),
        deleteWorkspaces: () => setDialog({
          kind: 'deleteGroupWorkspaces',
          groupId: group.id,
          name: group.name,
          count: members.length,
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
          onClick={() => setExpanded(key, !isOpen)}
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

  const confirmArchiveGroup = async (groupId: string): Promise<void> => {
    const group = groups?.find(candidate => candidate.id === groupId)
    if (group === undefined) return
    setBusy(true)
    try {
      for (const workspaceId of group.workspaceIds) {
        for (const sessionId of contentOf(workspaceId)) {
          // `contentOf` already drops archived rows and the blank placeholder:
          // exactly the members the count promised.
          await archiveWithFallback(sessionId)
            .catch(error => console.warn('workspace-organize: archive refused', sessionId, error))
        }
      }
    } finally {
      setBusy(false)
      setDialog(undefined)
    }
  }

  const confirmDeleteGroupWorkspaces = async (groupId: string): Promise<void> => {
    const group = currentGroups.find(candidate => candidate.id === groupId)
    if (group === undefined) return
    setBusy(true)
    try {
      for (const workspaceId of group.workspaceIds) {
        await services.deleteWorkspace(asWorkspaceId(workspaceId))
          .catch(error => console.warn('workspace-organize: delete failed', workspaceId, error))
      }
      persist(currentGroups.filter(candidate => candidate.id !== groupId))
    } finally {
      setBusy(false)
      setDialog(undefined)
    }
  }

  const addWorkspace = (): void => {
    void services.pickDirectory().then((path) => {
      if (path === null || path === '') return undefined
      return services.createWorkspace({ path })
    }).catch(error => console.warn('workspace-organize: add workspace failed', error))
  }

  /** Pin every node open or shut, overwriting earlier per-node choices. */
  const setAllExpanded = (value: boolean): void => {
    const next: Record<string, boolean> = {}
    for (const group of groups ?? []) next[`g:${group.id}`] = value
    for (const workspace of workspaces) next[`ws:${workspace.workspaceId}`] = value
    persistExpansion(next)
  }

  const viewMenu: MenuSpec = {
    items: [
      { id: 'newGroup', label: messages.newGroup, icon: <IconProjectAddOutlineRegular /> },
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

  return (
    <div className={`dwo-browse${wide ? '' : ' rail'}`}>
      <style>{STYLES}</style>
      <div className="dwo-header">
        <span className={`dwo-head-label${searchOpen ? ' hidden' : ''}`}>{messages.organizeTitle}</span>
        <div className={`dwo-search-slot${searchOpen ? ' open' : ''}`}>
          <div className={`dwo-search${searchOpen ? ' open' : ''}`}>
            <Tooltip
              label={searchOpen ? messages.closeSearch : messages.search}
              side="bottom"
              align="end"
              delayMs={500}
              portal
            >
              <button
                type="button"
                className="dwo-icon-btn dwo-search-btn"
                onClick={() => {
                  setSearchOpen(value => !value)
                  if (searchOpen) setQuery('')
                }}
              >
                <IconSearchOutlineRegular size={16} />
              </button>
            </Tooltip>
            {searchOpen && (
              <input
                className="dwo-search-input"
                autoFocus
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
            )}
          </div>
        </div>
        <div className={`dwo-head-actions${searchOpen ? ' hidden' : ''}`}>
          <Tooltip label={messages.viewOptions} side="bottom" align="end" delayMs={500} portal>
            <button
              type="button"
              className="dwo-icon-btn"
              onClick={(event) => {
                event.stopPropagation()
                openMenuUnder('view', viewMenu, event.currentTarget)
              }}
            >
              <IconSlidersTwoOutlineRegular size={16} />
            </button>
          </Tooltip>
          <Tooltip label={messages.addWorkspace} side="bottom" align="end" delayMs={500} portal>
            <button type="button" className="dwo-icon-btn" onClick={addWorkspace}>
              <IconProjectAddOutlineRegular size={16} />
            </button>
          </Tooltip>
          {!hostSaved && <span className="dwo-saving" title={messages.savePending}>…</span>}
        </div>
      </div>
      {pendingLoad
        ? <div className="dwo-empty">{messages.loading}</div>
        : archivedFilter === 'only' && !hasVisibleContent
          ? (
              <div className="dwo-list" role="tree" aria-label={messages.organizeTitle}>
                <div className="dwo-empty">
                  {/* An empty archive and a query that misses are different
                      facts, and the row below has to name the right one. */}
                  {hasArchived ? messages.noMatches : messages.archivedOnlyEmpty}
                  {!hasArchived && (
                    <>
                      {' '}
                      {/* The way back is the shipped browser's "view other
                          sessions": an ordinary view. With an empty archive
                          `default` and `show` render the same rows, so there is
                          nothing for `show` to add. */}
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
              </div>
            )
          : (
              <div className="dwo-list" role="tree" aria-label={messages.organizeTitle}>
                {currentGroups.map(group => groupNode(group, 0))}
                {currentGroups.length > 0 && ungrouped.length > 0 && (
                  <div className="dwo-sep">{messages.ungrouped}</div>
                )}
                {ungrouped.map(workspace => workspaceRow(workspace, 0))}
                {currentGroups.length === 0 && ungrouped.length === 0 && (
                  <div className="dwo-empty">{messages.noWorkspaces}</div>
                )}
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
          close={() => { if (!busy) setDialog(undefined) }}
          submit={(name) => { void submitDialog(dialog, name) }}
        />
      )}
    </div>
  )

  /** Identity of one dialog, so a new dialog starts from clean field values. */
  function dialogKey(current: Dialog): string {
    switch (current.kind) {
      case 'renameGroup': return `rename-group:${current.groupId}`
      case 'renameWorkspace': return `rename-workspace:${current.workspaceId}`
      case 'renameSession': return `rename-session:${current.sessionId}`
      case 'archiveGroup': return `archive-group:${current.groupId}`
      case 'deleteGroupWorkspaces': return `delete-workspaces:${current.groupId}`
      case 'deleteWorkspace': return `delete-workspace:${current.workspaceId}`
      default: return 'create-group'
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
        if (trimmed !== '' && trimmed !== current.current) {
          await services.renameWorkspace(current.workspaceId, trimmed)
            .catch(error => console.warn('workspace-organize: rename failed', error))
        }
        setDialog(undefined)
        return
      }
      case 'renameSession': {
        const trimmed = name.trim()
        if (trimmed !== '' && trimmed !== current.current) {
          await services.renameSession(current.sessionId, trimmed)
            .catch(error => console.warn('workspace-organize: session rename failed', error))
        }
        setDialog(undefined)
        return
      }
      case 'archiveGroup':
        await confirmArchiveGroup(current.groupId)
        return
      case 'deleteGroupWorkspaces':
        await confirmDeleteGroupWorkspaces(current.groupId)
        return
      case 'deleteWorkspace': {
        await services.deleteWorkspace(current.workspaceId)
          .catch(error => console.warn('workspace-organize: delete failed', error))
        setDialog(undefined)
        return
      }
    }
  }
}

/** One field-bearing or confirming dialog, on the shipped modal. */
function DialogHost({ dialog, busy, close, submit }: {
  dialog: Dialog
  busy: boolean
  close: () => void
  submit: (name: string) => void
}) {
  const [name, setName] = useState(() => currentName(dialog))
  const needsName = dialogNeedsName(dialog)
  return (
    <Modal
      open
      onClose={close}
      title={dialogTitle(dialog)}
      closeLabel={messages.close}
      description={dialogBody(dialog)}
      footer={(
        <>
          <Button variant="outline" size="md" onClick={close} disabled={busy}>{messages.cancel}</Button>
          <Button variant="primary" size="md" onClick={() => submit(name)} disabled={busy}>
            {busy ? messages.working : messages.ok}
          </Button>
        </>
      )}
    >
      {needsName && (
        <Input
          value={name}
          placeholder={dialogFieldLabel(dialog)}
          aria-label={dialogFieldLabel(dialog)}
          data-modal-autofocus
          onChange={event => setName(event.target.value)}
        />
      )}
    </Modal>
  )
}

/** Whether one dialog edits a name. */
function dialogNeedsName(dialog: Dialog): boolean {
  return dialog.kind === 'createGroup'
    || dialog.kind === 'renameGroup'
    || dialog.kind === 'renameWorkspace'
    || dialog.kind === 'renameSession'
}

/** The name a rename dialog starts from. */
function currentName(dialog: Dialog): string {
  switch (dialog.kind) {
    case 'renameGroup':
    case 'renameWorkspace':
    case 'renameSession':
      return dialog.current
    default:
      return ''
  }
}

/** One dialog's heading. */
function dialogTitle(dialog: Dialog): string {
  switch (dialog.kind) {
    case 'createGroup': return messages.newGroup
    case 'renameGroup': return messages.renameGroup
    case 'renameWorkspace': return messages.renameWorkspace
    case 'renameSession': return messages.renameSession
    case 'archiveGroup': return messages.archiveGroup
    case 'deleteGroupWorkspaces': return messages.deleteGroupWorkspaces
    case 'deleteWorkspace': return messages.deleteWorkspace
  }
}

/** One dialog's supporting sentence. */
function dialogBody(dialog: Dialog): string | undefined {
  switch (dialog.kind) {
    case 'archiveGroup': return messages.archiveGroupBody(dialog.count)
    case 'deleteGroupWorkspaces': return messages.deleteGroupWorkspacesBody(dialog.count)
    case 'deleteWorkspace': return messages.deleteWorkspaceBody
    default: return undefined
  }
}

/** One dialog's field label, doubling as its placeholder. */
function dialogFieldLabel(dialog: Dialog): string {
  switch (dialog.kind) {
    case 'renameWorkspace': return messages.nameWorkspace
    case 'renameSession': return messages.nameSession
    default: return messages.nameGroup
  }
}
