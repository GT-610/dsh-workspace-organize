/**
 * The dialog layer: one modal, the shape of what it edits, and the copy it shows.
 *
 * Extracted from the browser so the tree only has to hand it a `Dialog` and a
 * submit callback: every dialog kind is a variant of one type, and the copy for
 * each is a pure function of that variant.
 */
import type { SessionActivity, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { MAX_GROUP_NAME_LENGTH } from '../shared/contract.ts'
import type { Messages } from './i18n.ts'

/** Which dialog is on screen, and the facts it needs. */
export type Dialog =
  | { kind: 'createGroup' }
  | { kind: 'renameGroup'; groupId: string; current: string }
  | { kind: 'renameWorkspace'; workspaceId: WorkspaceId; current: string }
  | { kind: 'renameSession'; sessionId: SessionId; current: string }
  | {
    kind: 'archiveGroup'
    groupId: string
    /** Sessions the confirmation counted, frozen at open time. */
    targets: readonly SessionId[]
    /** How many of them were running when the dialog opened. */
    running: number
    /** Targets whose running work the operator agreed to stop. */
    stopIds: readonly SessionId[]
  }
  | {
    kind: 'deleteGroupWorkspaces'
    groupId: string
    /** Workspace ids the confirmation counted, frozen at open time. */
    workspaceIds: readonly string[]
  }
  | { kind: 'deleteWorkspace'; workspaceId: WorkspaceId }
  | { kind: 'archiveSession'; sessionId: SessionId; title: string; activity: readonly SessionActivity[] }


/**
 * Name one activity family in the stop-and-archive confirmation.
 * @param activity - one family the Host reported.
 * @param messages - copy for the family and its count.
 * @returns the localized line.
 */
function activityLine(activity: SessionActivity, messages: Messages): string {
  const count = activity.items?.length ?? 1
  // The kind union is merged by other packages; this plugin only compiles the
  // augmentations it imports, so compare as a string and keep the default line.
  const kind: string = activity.kind
  switch (kind) {
    case 'turn': return messages.activityTurn
    case 'subagent': return messages.activitySubagent(count)
    case 'job': return messages.activityJob(count)
    case 'schedule': return messages.activitySchedule(count)
    default: return messages.activityOther(count)
  }
}

/** Identity of one dialog, so a new dialog starts from clean field values. */
export function dialogKey(current: Dialog): string {
  switch (current.kind) {
    case 'renameGroup': return `rename-group:${current.groupId}`
    case 'renameWorkspace': return `rename-workspace:${current.workspaceId}`
    case 'renameSession': return `rename-session:${current.sessionId}`
    case 'archiveGroup': return `archive-group:${current.groupId}`
    case 'deleteGroupWorkspaces': return `delete-workspaces:${current.groupId}`
    case 'deleteWorkspace': return `delete-workspace:${current.workspaceId}`
    case 'archiveSession': return `archive-session:${current.sessionId}`
    default: return 'create-group'
  }
}

/** One field-bearing or confirming dialog, on the shipped modal. */
export function DialogHost({ dialog, busy, messages, close, submit }: {
  dialog: Dialog
  busy: boolean
  messages: Messages
  close: () => void
  submit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(() => currentName(dialog))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const needsName = dialogNeedsName(dialog)
  const disabled = busy || pending
  const confirmLabel = dialogConfirmLabel(dialog, messages)
  const confirm = (): void => {
    if (disabled) return
    setPending(true)
    setError(undefined)
    // The dialog stays open with the failure on screen: a refused stop or a
    // rejected rename must not look like it worked.
    void submit(name)
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setPending(false))
  }
  return (
    <Modal
      open
      onClose={() => { if (!disabled) close() }}
      title={dialogTitle(dialog, messages)}
      closeLabel={messages.close}
      description={dialogBody(dialog, messages)}
      footer={(
        <>
          <Button variant="outline" size="md" onClick={close} disabled={disabled}>{messages.cancel}</Button>
          <Button variant="primary" size="md" onClick={confirm} disabled={disabled}>
            {disabled ? messages.working : confirmLabel}
          </Button>
        </>
      )}
    >
      {dialog.kind === 'archiveSession' && dialog.activity.length > 0 && (
        <ul className="dwo-activity" aria-label={messages.activityLabel}>
          {dialog.activity.map((activity, index) => (
            <li key={`${activity.kind}-${String(index)}`}>{activityLine(activity, messages)}</li>
          ))}
        </ul>
      )}
      {needsName && (
        <Input
          value={name}
          placeholder={dialogFieldLabel(dialog, messages)}
          aria-label={dialogFieldLabel(dialog, messages)}
          maxLength={dialogNameLimit(dialog)}
          data-modal-autofocus
          onChange={event => setName(event.target.value)}
        />
      )}
      {error !== undefined && <div className="dwo-dialog-error" role="alert">{error}</div>}
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

/**
 * The character cap of one dialog's name field, when the field has one.
 *
 * A group name is bounded by the group document, which the Host validates whole:
 * one name past {@link MAX_GROUP_NAME_LENGTH} and every save of that document is
 * refused as an invalid document — a refusal the retry control reports, but one
 * the operator can do nothing about. Capping the field keeps that state
 * unreachable. A Workspace or
 * Session title belongs to its own controller, which validates it itself, so
 * those dialogs carry no cap of their own.
 * @param dialog - the dialog being rendered.
 * @returns the field's `maxLength`, or `undefined` when it has none.
 */
function dialogNameLimit(dialog: Dialog): number | undefined {
  return dialog.kind === 'createGroup' || dialog.kind === 'renameGroup'
    ? MAX_GROUP_NAME_LENGTH
    : undefined
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
function dialogTitle(dialog: Dialog, messages: Messages): string {
  switch (dialog.kind) {
    case 'createGroup': return messages.newGroup
    case 'renameGroup': return messages.renameGroup
    case 'renameWorkspace': return messages.renameWorkspace
    case 'renameSession': return messages.renameSession
    case 'archiveGroup': return messages.archiveGroup
    case 'deleteGroupWorkspaces': return messages.deleteGroupWorkspaces
    case 'deleteWorkspace': return messages.deleteWorkspace
    case 'archiveSession': return messages.archiveConfirmTitle
  }
}

/** One dialog's supporting sentence. */
function dialogBody(dialog: Dialog, messages: Messages): string | undefined {
  switch (dialog.kind) {
    case 'archiveGroup': {
      const body = messages.archiveGroupBody(dialog.targets.length)
      return dialog.running > 0 ? `${body} ${messages.archiveGroupRunning(dialog.running)}` : body
    }
    case 'deleteGroupWorkspaces': return messages.deleteGroupWorkspacesBody(dialog.workspaceIds.length)
    case 'deleteWorkspace': return messages.deleteWorkspaceBody
    case 'archiveSession': return messages.archiveConfirmBody(dialog.title)
    default: return undefined
  }
}

/** One dialog's primary-button label. */
function dialogConfirmLabel(dialog: Dialog, messages: Messages): string {
  return dialog.kind === 'archiveSession' ? messages.archiveConfirmAction : messages.ok
}

/** One dialog's field label, doubling as its placeholder. */
function dialogFieldLabel(dialog: Dialog, messages: Messages): string {
  switch (dialog.kind) {
    case 'renameWorkspace': return messages.nameWorkspace
    case 'renameSession': return messages.nameSession
    default: return messages.nameGroup
  }
}
