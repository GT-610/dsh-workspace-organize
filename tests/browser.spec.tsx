/**
 * The registered browser, mounted in jsdom against the primitives double.
 *
 * These prove the plugin's own wiring: which rows appear for a given catalog,
 * what a row's verbs do, and that the group and workspace menus reach the right
 * operation. The shipped primitives' appearance is the shell's business.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { GroupedBrowser } from '../src/client/Browser.tsx'
import type { OrganizeBrowserProps, Services } from '../src/client/contract.ts'
import { messages } from '../src/client/i18n.ts'

const id = (value: string): SessionId => value as SessionId

/** One list row with the fields the browser reads. */
function sessionRow(value: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: id(value),
    displayTitle: value,
    running: false,
    blank: false,
    updatedAt: Date.now(),
    retainedBy: {},
    ...overrides,
  } as SessionSummary
}

/** One workspace view over the sessions it accounts for. */
function workspaceView(title: string, members: readonly string[]): WorkspaceView {
  return {
    workspaceId: title,
    path: `C:/repos/${title}`,
    title,
    sessionIds: members.map(id),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorkspaceView
}

/** The operations a mounted browser should reach, recorded per call. */
function fakeServices() {
  return {
    openSession: vi.fn(),
    startSession: vi.fn(),
    archiveSession: vi.fn().mockResolvedValue(undefined),
    unarchiveSession: vi.fn().mockResolvedValue(undefined),
    renameWorkspace: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    createWorkspace: vi.fn().mockResolvedValue(undefined),
    pickDirectory: vi.fn().mockResolvedValue(null),
  } satisfies Services
}

/** Props for one mount: real hooks, fake snapshots, recorded operations. */
function propsFor(
  workspaces: readonly WorkspaceView[],
  sessions: readonly SessionSummary[],
  services: Services,
  statuses: SessionStatusSnapshot = new Map(),
  archived: readonly string[] = [],
): OrganizeBrowserProps {
  const list = {
    ids: sessions.map(row => row.id),
    byId: Object.fromEntries(sessions.map(row => [row.id, row])),
    phase: 'ready',
  } as unknown as SessionListState
  const workspaceSnapshot = {
    items: workspaces,
    archivedSessionIds: archived.map(id),
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
  }
  return {
    wide: true,
    expandSidebar: vi.fn(),
    useWorkspaces: <T,>(select: (snapshot: unknown) => T): T => select(workspaceSnapshot),
    useSessions: <T,>(select: (snapshot: unknown) => T): T => select(list),
    useSessionStatus: <T,>(select: (snapshot: unknown) => T): T => select(statuses),
    usePanelInfo: <T,>(select: (snapshot: unknown) => T): T => select({ activePanelId: null }),
    services,
  } as unknown as OrganizeBrowserProps
}

/** The catalog one mount renders: one group holding one workspace. */
function mountBrowser(services: Services = fakeServices()) {
  const current = sessionRow('blank-current', {
    blank: true,
    retainedBy: { mainView: 1 } as SessionSummary['retainedBy'],
  })
  const spent = sessionRow('blank-spent', { blank: true })
  const named = sessionRow('named')
  const repo = workspaceView('repo', ['named', 'blank-spent', 'blank-current'])
  const other = workspaceView('other', [])
  const view = render(
    <GroupedBrowser {...propsFor([repo, other], [current, spent, named], services)} />,
  )
  return { view, services }
}

beforeEach(() => {
  localStorage.clear()
  // The browser loads its group document on mount; the Host answers with a group
  // holding `repo` so the grouped path renders instead of the ungrouped one.
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'POST'
      ? { version: 1, groups: [] }
      : { version: 1, groups: [{ id: 'g1', name: 'Work', workspaceIds: ['repo'] }] }),
  })))
})

afterEach(() => {
  // No globals in this config, so Testing Library's automatic cleanup is off:
  // without this, every mount would leave its tree behind and text queries
  // would start matching several copies.
  cleanup()
  vi.unstubAllGlobals()
})

describe('GroupedBrowser rows', () => {
  it('renders the group, its workspace, and only the visible sessions', async () => {
    mountBrowser()
    expect(await screen.findByText('Work')).toBeDefined()
    expect(screen.getByText('repo')).toBeDefined()
    expect(screen.getByText('other')).toBeDefined()
    // The retained placeholder and the real session; the spent draft is gone.
    expect(screen.getByText(messages.blankSession)).toBeDefined()
    expect(screen.getByText('named')).toBeDefined()
    expect(screen.queryByText('blank-spent')).toBeNull()
  })

  it('gives the placeholder no timestamp and no verbs', async () => {
    mountBrowser()
    await screen.findByText(messages.blankSession)
    const placeholder = document.querySelector('[data-row-key="session:blank-current"]')
    expect(placeholder).not.toBeNull()
    expect(placeholder?.querySelector('.dwo-time')).toBeNull()
    expect(placeholder?.querySelector('.dwo-actions')).toBeNull()
    // The real session in the same workspace keeps both.
    const named = document.querySelector('[data-row-key="session:named"]')
    expect(named?.querySelector('.dwo-time')).not.toBeNull()
    expect(named?.querySelector('.dwo-actions')).not.toBeNull()
  })

  it('opens a session when its row is clicked', async () => {
    const { services } = mountBrowser()
    await screen.findByText('named')
    await userEvent.click(screen.getByText('named'))
    expect(services.openSession).toHaveBeenCalledWith('named')
  })

  it('rolls member statuses up into the group row', async () => {
    const statuses: SessionStatusSnapshot = new Map([
      [id('named'), { running: true, pendingInteraction: undefined, completionUnread: false }],
    ])
    const services = fakeServices()
    const current = sessionRow('blank-current', { blank: true, retainedBy: { mainView: 1 } as SessionSummary['retainedBy'] })
    const named = sessionRow('named')
    const repo = workspaceView('repo', ['named', 'blank-current'])
    render(<GroupedBrowser {...propsFor([repo], [current, named], services, statuses)} />)
    await screen.findByText('Work')
    const count = document.querySelector('.dwo-count')
    expect(count?.textContent).toContain(`1 ${messages.unitWorkspaces}`)
    expect(count?.textContent).toContain(`1 ${messages.unitRunning}`)
    expect(count?.querySelector('[data-state-dot="ongoing"]')).not.toBeNull()
  })
})

/**
 * The verb buttons of one row.
 *
 * They live in a hover strip (`display:none` until the row is hovered), so role
 * queries must include hidden elements to reach them.
 * @param row - the row element to search.
 * @returns its buttons, in DOM order.
 */
function rowButtons(row: Element): HTMLElement[] {
  return within(row as HTMLElement).getAllByRole('button', { hidden: true })
}

describe('GroupedBrowser menus', () => {
  it('opens the workspace menu and moves the workspace out of its group', async () => {
    const { services } = mountBrowser()
    await screen.findByText('repo')
    const row = document.querySelector('[data-row-key="workspace:repo"]')
    expect(row).not.toBeNull()
    await userEvent.click(rowButtons(row as Element)[0] as HTMLElement)
    const menu = await screen.findByRole('menu', { hidden: true })
    expect(within(menu).getByText(messages.renameWorkspace)).toBeDefined()
    await userEvent.click(within(menu).getByText(messages.removeFromGroup))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }))
    })
    expect(services.renameWorkspace).not.toHaveBeenCalled()
  })

  it('starts a session from the workspace menu', async () => {
    const { services } = mountBrowser()
    await screen.findByText('repo')
    const row = document.querySelector('[data-row-key="workspace:repo"]') as Element
    await userEvent.click(rowButtons(row)[1] as HTMLElement)
    expect(services.startSession).toHaveBeenCalledWith('repo')
  })

  it('confirms a workspace deletion through the modal', async () => {
    const { services } = mountBrowser()
    await screen.findByText('repo')
    const row = document.querySelector('[data-row-key="workspace:repo"]') as Element
    await userEvent.click(rowButtons(row)[0] as HTMLElement)
    const menu = await screen.findByRole('menu', { hidden: true })
    await userEvent.click(within(menu).getByText(messages.deleteWorkspace))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    expect(within(dialog).getByText(messages.deleteWorkspace)).toBeDefined()
    await userEvent.click(within(dialog).getByText(messages.ok))
    await waitFor(() => { expect(services.deleteWorkspace).toHaveBeenCalledWith('repo') })
  })

  it('collapses every workspace from the view menu', async () => {
    mountBrowser()
    await screen.findByText('repo')
    const viewButton = document.querySelector('.dwo-head-actions .dwo-icon-btn') as HTMLElement
    await userEvent.click(viewButton)
    const menu = await screen.findByRole('menu', { hidden: true })
    await userEvent.click(within(menu).getByText(messages.collapseAll))
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('workspaceOrganize.expansion') ?? '{}') as Record<string, boolean>
      expect(stored['ws:repo']).toBe(false)
      expect(stored['g:g1']).toBe(false)
    })
  })

  it('drops disclosure choices for nodes that no longer exist', async () => {
    // Keyed for a group and a workspace the catalog does not have: the mirror
    // must not accumulate them forever.
    localStorage.setItem('workspaceOrganize.expansion', JSON.stringify({
      'g:g1': true,
      'ws:repo': false,
      'g:deleted': true,
      'ws:gone-away': false,
    }))
    mountBrowser()
    await screen.findByText('Work')
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('workspaceOrganize.expansion') ?? '{}') as Record<string, boolean>
      expect(Object.keys(stored).toSorted()).toEqual(['g:g1', 'ws:repo'])
      expect(stored['g:g1']).toBe(true)
      expect(stored['ws:repo']).toBe(false)
    })
  })
})

/**
 * The catalog for the archived-row cases: one group holding one workspace with
 * a live session, an archived one, and the retained placeholder.
 *
 * The placeholder matters: it keeps `repo` open, which is the shipped resting
 * shape and what makes its session rows reachable at all.
 * @returns the recorded operations the mount exposes.
 */
function mountWithArchive() {
  const current = sessionRow('blank-current', {
    blank: true,
    retainedBy: { mainView: 1 } as SessionSummary['retainedBy'],
  })
  const named = sessionRow('named')
  const gone = sessionRow('gone')
  const repo = workspaceView('repo', ['named', 'gone', 'blank-current'])
  const services = fakeServices()
  render(<GroupedBrowser {...propsFor([repo], [current, named, gone], services, new Map(), ['gone'])} />)
  return services
}

/**
 * Choose one row of the view options menu.
 * @param label - the row's visible label.
 */
async function chooseViewOption(label: string): Promise<void> {
  const viewButton = document.querySelector('.dwo-head-actions .dwo-icon-btn') as HTMLElement
  await userEvent.click(viewButton)
  const menu = await screen.findByRole('menu', { hidden: true })
  await userEvent.click(within(menu).getByText(label))
  await waitFor(() => { expect(screen.queryByRole('menu', { hidden: true })).toBeNull() })
}

describe('GroupedBrowser archived rows', () => {
  it('hides an archived row by default', async () => {
    mountWithArchive()
    await screen.findByText('named')
    expect(screen.queryByText('gone')).toBeNull()
  })

  it('shows an archived row beside the live ones and restores it', async () => {
    const services = mountWithArchive()
    await screen.findByText('named')
    await chooseViewOption(messages.showArchived)
    expect(await screen.findByText('gone')).toBeDefined()
    // An archived row keeps its hover restore button instead of an archive one.
    const row = document.querySelector('[data-row-key="session:gone"]') as Element
    await userEvent.click(rowButtons(row)[0] as HTMLElement)
    await waitFor(() => { expect(services.unarchiveSession).toHaveBeenCalledWith('gone') })
    expect(services.archiveSession).not.toHaveBeenCalled()
  })

  it('does not open an archived row', async () => {
    const services = mountWithArchive()
    await screen.findByText('named')
    await chooseViewOption(messages.showArchived)
    await userEvent.click(await screen.findByText('gone'))
    expect(services.openSession).not.toHaveBeenCalled()
  })

  it('lists nothing but archived rows under the archived-only filter', async () => {
    mountWithArchive()
    await screen.findByText('named')
    await chooseViewOption(messages.onlyArchived)
    expect(await screen.findByText('gone')).toBeDefined()
    expect(screen.queryByText('named')).toBeNull()
    expect(screen.queryByText(messages.blankSession)).toBeNull()
  })

  it('offers the way back when nothing is archived', async () => {
    const current = sessionRow('blank-current', {
      blank: true,
      retainedBy: { mainView: 1 } as SessionSummary['retainedBy'],
    })
    const named = sessionRow('named')
    const repo = workspaceView('repo', ['named', 'blank-current'])
    render(<GroupedBrowser {...propsFor([repo], [current, named], fakeServices())} />)
    await screen.findByText('named')
    await chooseViewOption(messages.onlyArchived)
    expect(await screen.findByText(messages.archivedOnlyEmpty)).toBeDefined()
    await userEvent.click(screen.getByText(messages.viewOtherSessions))
    expect(await screen.findByText('named')).toBeDefined()
  })

  it('says "no matches" when the archive holds rows the query misses', async () => {
    mountWithArchive()
    await screen.findByText('named')
    await chooseViewOption(messages.onlyArchived)
    expect(await screen.findByText('gone')).toBeDefined()
    // `gone` is archived but does not match: the empty state must name the
    // search, not claim the archive is empty.
    await userEvent.click(document.querySelector('.dwo-search-btn') as HTMLElement)
    await userEvent.type(await screen.findByPlaceholderText(messages.search), 'zzz')
    expect(await screen.findByText(messages.noMatches)).toBeDefined()
    expect(screen.queryByText(messages.archivedOnlyEmpty)).toBeNull()
    expect(screen.queryByText(messages.viewOtherSessions)).toBeNull()
  })

  it('remembers the filter across a reload', async () => {
    mountWithArchive()
    await screen.findByText('named')
    await chooseViewOption(messages.onlyArchived)
    expect(localStorage.getItem('workspaceOrganize.archivedFilter')).toBe('only')
  })

  it('archives a group counting only live, non-blank sessions', async () => {
    const services = mountWithArchive()
    await screen.findByText('repo')
    const groupRow = document.querySelector('[data-row-key="group:g1"]') as Element
    await userEvent.click(rowButtons(groupRow)[0] as HTMLElement)
    const menu = await screen.findByRole('menu', { hidden: true })
    await userEvent.click(within(menu).getByText(messages.archiveGroup))
    const dialog = await screen.findByRole('dialog', { hidden: true })
    // One live session: `gone` is already archived and the placeholder has no
    // content, so neither is promised nor touched.
    expect(within(dialog).getByText(messages.archiveGroupBody(1))).toBeDefined()
    await userEvent.click(within(dialog).getByText(messages.ok))
    await waitFor(() => { expect(services.archiveSession).toHaveBeenCalledWith('named') })
    expect(services.archiveSession).not.toHaveBeenCalledWith('gone')
    expect(services.archiveSession).not.toHaveBeenCalledWith('blank-current')
  })

  it('retries a refused archive once with the stop-then-archive path', async () => {
    const services = fakeServices()
    services.archiveSession = vi.fn()
      .mockRejectedValueOnce(new Error('session-active'))
      .mockResolvedValue(undefined)
    const current = sessionRow('blank-current', {
      blank: true,
      retainedBy: { mainView: 1 } as SessionSummary['retainedBy'],
    })
    const named = sessionRow('named')
    render(<GroupedBrowser {...propsFor([workspaceView('repo', ['named', 'blank-current'])], [current, named], services)} />)
    await screen.findByText('named')
    const row = document.querySelector('[data-row-key="session:named"]') as Element
    await userEvent.click(rowButtons(row)[0] as HTMLElement)
    await waitFor(() => {
      expect(services.archiveSession).toHaveBeenNthCalledWith(1, 'named')
      expect(services.archiveSession).toHaveBeenNthCalledWith(2, 'named', { stopActivity: true })
    })
  })
})
