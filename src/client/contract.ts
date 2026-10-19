/**
 * Client-side contract of the grouped browser.
 *
 * The registered component is a shadowing entry for `sidebar.workspaces`, so it
 * receives the owner share and the framework's standard hooks, plus the one
 * business face this entry injects for itself: the official operations it
 * drives. The official entry's own injected face is NOT forwarded to a
 * shadowing registration, which is why every operation crosses through a
 * lazily-resolved Cordis service instead of arriving as a prop.
 */
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Recover a branded Workspace id from the plain string the group document
 * stores. The document is JSON, so its ids are strings; every id in it was
 * minted by the official registry, which is what makes the narrowing sound.
 * @param value - the stored id.
 * @returns the same id, branded for the official client services.
 */
export function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId
}

/**
 * The official operations the browser drives.
 *
 * Every member resolves its service at call time, so an absent optional service
 * degrades one action instead of failing the mount.
 */
export interface Services {
  /** Select a Session and show its Conversation. */
  openSession: (sessionId: SessionId) => void
  /** Reuse-or-create the Workspace's provisional blank Session and open it. */
  startSession: (workspaceId: WorkspaceId) => void
  /** Archive a Session; `stopActivity` retries a refusal caused by running work. */
  archiveSession: (sessionId: SessionId, options?: { stopActivity?: boolean }) => Promise<void>
  /** Remove a Session from the registry-global archived set. */
  unarchiveSession: (sessionId: SessionId) => Promise<void>
  /** Rename a Workspace on the Host. */
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<void>
  /** Rename a Session through its own controller binding. */
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  /** Delete a Workspace registration; directory and logs stay. */
  deleteWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  /** Adopt a picked host directory as a Workspace. */
  createWorkspace: (input: { path: string }) => Promise<unknown>
  /** Ask the environment for a directory, or `null` when it has no picker. */
  pickDirectory: () => Promise<string | null>
}

/** The business face this entry injects into its own registration. */
export interface OrganizeBrowserInjected {
  services: Services
}

/** Props of the registered browser: runtime shares plus its injected face. */
export type OrganizeBrowserProps = PropsRuntime<'sidebar.workspaces'> & OrganizeBrowserInjected
