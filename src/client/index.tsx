/**
 * Client half of dsh-workspace-organize.
 *
 * Shadows the shipped `sidebar.workspaces` browser: the entry is registered at
 * `priority: -100`, and a single slot renders the lowest-priority live entry, so
 * the shipped entry stays registered — its declared child slots survive — while
 * this component wins the render. The tree is group > workspace > session.
 *
 * A shadowing entry receives only the owner share and the framework's standard
 * hooks; the official entry's injected action face is NOT forwarded. Every
 * business operation therefore resolves an official client service through
 * `ctx` at call time and arrives as this entry's own injected face.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Component, type ErrorInfo, type ReactNode } from 'react'
// Load the slot-map and standard-hook augmentations the browser composes from.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { GroupedBrowser } from './Browser.tsx'
import type { OrganizeBrowserInjected, OrganizeBrowserProps, Services } from './contract.ts'

/** Required services. `slots` is the render ledger this entry registers into. */
export const inject = ['slots']

/**
 * Loud-failure guard. A render crash in this entry makes the slot abdicate and
 * fall back to the shipped browser — and abdication unmounts the crashing
 * boundary together with its `data-slot-error` anchor, so the failure leaves no
 * trace in the DOM. Log the real error first, then re-throw so the slot's own
 * boundary still performs that fallback.
 */
class CrashReporter extends Component<{ children: ReactNode }, { error: Error | undefined }> {
  override state: { error: Error | undefined } = { error: undefined }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('workspace-organize: grouped browser crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error !== undefined) throw this.state.error
    return this.props.children
  }
}

/**
 * Report one operation that has no service to drive it.
 *
 * A warning rather than a throw: the tree still renders, and the operator sees
 * which action did nothing instead of losing the whole sidebar.
 * @param operation - the operation that could not run.
 */
function unavailable(operation: string): void {
  console.warn(`workspace-organize: uiWorkspace is unavailable; ${operation} is a no-op`)
}

/**
 * Resolve the official operations once, lazily at call time.
 *
 * Every member reads its service from `ctx` when it runs, so an operation whose
 * service is absent degrades that one action instead of failing the mount, and
 * a service that activates later is picked up without re-registering.
 * @param ctx - client root context.
 * @returns the operation face the browser injects for itself.
 */
function createServices(ctx: Context): Services {
  const workspaces = () => {
    const service = ctx.get('workspaces')
    if (service === undefined) {
      throw new Error('workspace-organize: the workspaces service is unavailable')
    }
    return service
  }

  return {
    openSession: (sessionId: SessionId) => {
      const ui = ctx.get('uiWorkspace')
      if (ui === undefined) { unavailable('openSession'); return }
      ui.openSession(sessionId)
    },
    startSession: (workspaceId: WorkspaceId) => {
      const ui = ctx.get('uiWorkspace')
      if (ui === undefined) { unavailable('startSession'); return }
      // No draft options: inheriting the current Workspace, then the recent one,
      // is the shipped New Session behavior, and it neither clears nor prepares
      // a draft until the operator types.
      ui.startSession(workspaceId)
    },
    archiveSession: (sessionId: SessionId, options?: { stopActivity?: boolean }) => {
      const ui = ctx.get('uiWorkspace')
      return ui !== undefined ? ui.archiveSession(sessionId, options) : workspaces().archiveSession(sessionId, options)
    },
    unarchiveSession: (sessionId: SessionId) => {
      const ui = ctx.get('uiWorkspace')
      return ui !== undefined ? ui.unarchiveSession(sessionId) : workspaces().unarchiveSession(sessionId)
    },
    renameWorkspace: (workspaceId: WorkspaceId, title: string) =>
      workspaces().rename(workspaceId, title).then(() => undefined),
    renameSession: async (sessionId: SessionId, title: string) => {
      // The shipped rename route: the session controller lends a reference whose
      // binding owns the rename, so the Host applies it through the same
      // operation source the official dialog uses.
      const sessions = ctx.get('sessions')
      if (sessions === undefined) {
        throw new Error('workspace-organize: the sessions service is unavailable')
      }
      const result = await sessions.using(
        sessionId,
        { source: 'workspaceOperation' },
        reference => reference.binding.session.rename(title),
      )
      if (!result.ok) throw new Error(result.error.message)
    },
    deleteWorkspace: (workspaceId: WorkspaceId) => workspaces().delete(workspaceId),
    createWorkspace: (input: { path: string }) => workspaces().create(input),
    pickDirectory: () => {
      // The official picker is the only picker: a deployment that cannot show
      // one either answers null or has no uiWorkspace to ask.
      const ui = ctx.get('uiWorkspace')
      if (ui === undefined) {
        unavailable('pickDirectory')
        return Promise.resolve(null)
      }
      return ui.pickDirectory()
    },
  }
}

/**
 * Register the grouped browser into the sidebar's workspace hole.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const services = createServices(ctx)
  // `slots.inject` waits for the sidebar to declare the hole: the declaration
  // belongs to ui-sidebar's apply, whose activation order is not guaranteed.
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      // Shadow the shipped entry (default priority 0) and leave room between
      // the two for another plugin to slot in.
      priority: -100,
      inject: (): OrganizeBrowserInjected => ({ services }),
    },
    function OrganizeBrowserEntry(props: OrganizeBrowserProps) {
      return (
        <CrashReporter>
          <GroupedBrowser {...props} />
        </CrashReporter>
      )
    },
  ))
}
