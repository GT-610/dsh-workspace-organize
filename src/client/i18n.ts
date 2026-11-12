/**
 * Plugin copy, registered with the Client locale service.
 *
 * The dictionaries are registered in `apply` and the browser receives the
 * framework `t` seat because its slot registration declares `locale`. Copy is
 * therefore resolved against the language the operator selected in DSH, not the
 * browser language, and a language switch re-renders the tree without a reload.
 *
 * Dictionaries are flat strings with `{name}` placeholders — the locale
 * service's own shape. {@link messagesFrom} turns one bound `t` into the
 * function-shaped {@link Messages} face the derivations take, so plural and
 * parameterized copy stays typed and testable without dragging the locale
 * runtime into `select.ts`.
 */
import type { RelativeTimeUnit } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Time buckets the rows date themselves with, coarsest last.
 *
 * The primitives' own vocabulary, not a copy of it: the shipped rows bucket the
 * same timestamps, and a row dated by this plugin must never use a bucket the
 * surface it replaces has no label for.
 */
export type TimeBucket = RelativeTimeUnit

/** Namespace this plugin owns in the Client locale registry. */
export const LOCALE_NS = 'workspaceOrganize'

/**
 * Every string this plugin renders, as the locale service stores it.
 *
 * Both dictionaries must carry exactly these keys: the typed registration
 * rejects a missing or extra key at compile time, and the service rejects a
 * missing language at runtime.
 */
export const EN_DICT = {
  // Header
  organizeTitle: 'Workspaces',
  addWorkspace: 'Add workspace',
  viewOptions: 'View options',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  savePending: 'Saving to the Host…',
  saveFailed: 'The Host did not accept the last change. Click to retry.',
  retrySave: 'Retry save',
  search: 'Search sessions',
  closeSearch: 'Close search',
  // List
  newGroup: 'New group',
  ungroupedWorkspaces: 'Ungrouped workspaces',
  ungroupedSessions: 'Ungrouped sessions',
  loading: 'Loading…',
  noWorkspaces: 'No workspaces yet',
  noSessions: 'No sessions',
  noMatches: 'No matches',
  emptyGroup: 'Move workspaces here from their ⋯ menu',
  // Archived-row visibility
  hideArchived: 'Hide archived sessions',
  showArchived: 'All sessions (show archived)',
  onlyArchived: 'Only archived sessions',
  archivedOnlyEmpty: 'No archived sessions yet',
  viewOtherSessions: 'View other sessions',
  archivedNotOpenable: 'Archived sessions cannot be opened. Restore it to view.',
  // Rows
  newSession: 'New session in this workspace',
  blankSession: 'New Session',
  untitled: 'Untitled',
  defaultWorkspace: 'Default workspace',
  workspaceMenu: 'Workspace menu',
  groupMenu: 'Group menu',
  renameWorkspace: 'Rename workspace…',
  deleteWorkspace: 'Delete workspace…',
  renameSession: 'Rename session…',
  archiveSession: 'Archive session',
  unarchive: 'Restore from archive',
  renameGroup: 'Rename group…',
  archiveGroup: 'Archive all sessions in group…',
  deleteGroupWorkspaces: 'Delete all workspaces in group…',
  removeFromGroup: 'Move out of group',
  moveToGroup: 'Move to group',
  ungroup: 'Ungroup (keep workspaces)',
  unitWorkspaces: 'workspaces',
  unitSessions: 'sessions',
  unitRunning: 'running',
  unitPending: 'waiting',
  statusApproval: 'Approval',
  statusPlanReview: 'Plan review',
  statusQuestion: 'Answer',
  // Dialogs
  cancel: 'Cancel',
  ok: 'OK',
  working: 'Working…',
  close: 'Close',
  nameGroup: 'Group name',
  nameWorkspace: 'Workspace name',
  nameSession: 'Session name',
  archiveGroupBody: 'All {count} session(s) in this group will be archived. Workspaces stay.',
  archiveGroupRunning: '{count} still-running session(s) will be stopped first.',
  deleteGroupWorkspacesBody: 'All {count} workspace(s) in this group will be removed from DSH. Session logs stay on disk. This cannot be undone.',
  deleteWorkspaceBody: 'The registration is removed from DSH. Session logs stay on disk.',
  archiveConfirmTitle: 'Stop running work and archive?',
  archiveConfirmBody: '“{title}” still has running work. Archiving stops that work first; stopped work does not resume on its own.',
  archiveConfirmAction: 'Stop and archive',
  activityLabel: 'Work that will be stopped',
  activityTurn: 'The turn in progress',
  activitySubagent: '{count} running subagent(s)',
  activityJob: '{count} background job(s)',
  activitySchedule: '{count} scheduled reminder(s)',
  activityOther: '{count} active item(s)',
  // Time buckets
  timeNow: 'now',
  timeMinutes: '{count}min',
  timeHours: '{count}h',
  timeDays: '{count}d',
  timeMonths: '{count}mo',
  timeYears: '{count}y',
} as const

/** The same keys, in Chinese. */
export const ZH_DICT: Record<keyof typeof EN_DICT, string> = {
  organizeTitle: '工作区',
  addWorkspace: '添加工作区',
  viewOptions: '视图选项',
  expandAll: '展开全部',
  collapseAll: '折叠全部',
  savePending: '正在保存到 Host…',
  saveFailed: 'Host 未接受上次修改，点击重试。',
  retrySave: '重试保存',
  search: '搜索会话',
  closeSearch: '关闭搜索',
  newGroup: '新建分组',
  ungroupedWorkspaces: '未分组的工作区',
  ungroupedSessions: '未分组的会话',
  loading: '加载中…',
  noWorkspaces: '暂无工作区',
  noSessions: '暂无会话',
  noMatches: '无匹配',
  emptyGroup: '从工作区的 ⋯ 菜单移入工作区',
  hideArchived: '隐藏已归档会话',
  showArchived: '全部会话(含已归档)',
  onlyArchived: '只看已归档会话',
  archivedOnlyEmpty: '暂无已归档会话',
  viewOtherSessions: '查看其他会话',
  archivedNotOpenable: '已归档会话暂时无法查看，请从归档恢复后再查看。',
  newSession: '在此工作区新建会话',
  blankSession: '新会话',
  untitled: '未命名',
  defaultWorkspace: '默认工作区',
  workspaceMenu: '工作区菜单',
  groupMenu: '分组菜单',
  renameWorkspace: '重命名工作区…',
  deleteWorkspace: '删除工作区…',
  renameSession: '重命名会话…',
  archiveSession: '归档会话',
  unarchive: '从归档恢复',
  renameGroup: '重命名分组…',
  archiveGroup: '归档组内全部会话…',
  deleteGroupWorkspaces: '删除组内全部工作区…',
  removeFromGroup: '移出分组',
  moveToGroup: '移入分组',
  ungroup: '解散分组(保留工作区)',
  unitWorkspaces: '工作区',
  unitSessions: '会话',
  unitRunning: '运行中',
  unitPending: '待处理',
  statusApproval: '待审批',
  statusPlanReview: '计划待审',
  statusQuestion: '待回答',
  cancel: '取消',
  ok: '确定',
  working: '处理中…',
  close: '关闭',
  nameGroup: '分组名称',
  nameWorkspace: '工作区名称',
  nameSession: '会话名称',
  archiveGroupBody: '该分组内共 {count} 个会话将被归档。工作区保留。',
  archiveGroupRunning: '其中 {count} 个仍在运行的会话会先被停止。',
  deleteGroupWorkspacesBody: '该分组内共 {count} 个工作区将从 DSH 移除;会话日志仍保留在磁盘上。此操作不可撤销。',
  deleteWorkspaceBody: '将从 DSH 移除该工作区登记;会话日志仍保留在磁盘上。',
  archiveConfirmTitle: '停止运行中的工作并归档？',
  archiveConfirmBody: '“{title}”仍有正在进行的工作。归档会先停止这些工作;被停止的工作不会自动继续。',
  archiveConfirmAction: '停止并归档',
  activityLabel: '将被停止的工作',
  activityTurn: '进行中的回合',
  activitySubagent: '{count} 个子智能体运行中',
  activityJob: '{count} 个后台任务',
  activitySchedule: '{count} 条定时提醒',
  activityOther: '{count} 项进行中的工作',
  timeNow: '刚刚',
  timeMinutes: '{count}分钟',
  timeHours: '{count}小时',
  timeDays: '{count}天',
  timeMonths: '{count}个月',
  timeYears: '{count}年',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The grouped browser's copy. */
    workspaceOrganize: keyof typeof EN_DICT
  }
}

/** Every string this plugin renders, with the interpolation already applied. */
export interface Messages {
  // Header
  organizeTitle: string
  addWorkspace: string
  viewOptions: string
  expandAll: string
  collapseAll: string
  savePending: string
  saveFailed: string
  retrySave: string
  search: string
  closeSearch: string
  // List
  newGroup: string
  ungroupedWorkspaces: string
  ungroupedSessions: string
  loading: string
  noWorkspaces: string
  noSessions: string
  noMatches: string
  emptyGroup: string
  // Archived-row visibility
  hideArchived: string
  showArchived: string
  onlyArchived: string
  archivedOnlyEmpty: string
  viewOtherSessions: string
  archivedNotOpenable: string
  // Rows
  newSession: string
  blankSession: string
  untitled: string
  defaultWorkspace: string
  workspaceMenu: string
  groupMenu: string
  renameWorkspace: string
  deleteWorkspace: string
  renameSession: string
  archiveSession: string
  unarchive: string
  renameGroup: string
  archiveGroup: string
  deleteGroupWorkspaces: string
  removeFromGroup: string
  moveToGroup: string
  ungroup: string
  unitWorkspaces: string
  unitSessions: string
  unitRunning: string
  unitPending: string
  statusApproval: string
  statusPlanReview: string
  statusQuestion: string
  // Dialogs
  cancel: string
  ok: string
  working: string
  close: string
  nameGroup: string
  nameWorkspace: string
  nameSession: string
  archiveGroupBody: (count: number) => string
  archiveGroupRunning: (count: number) => string
  deleteGroupWorkspacesBody: (count: number) => string
  deleteWorkspaceBody: string
  archiveConfirmTitle: string
  archiveConfirmBody: (title: string) => string
  archiveConfirmAction: string
  activityLabel: string
  activityTurn: string
  activitySubagent: (count: number) => string
  activityJob: (count: number) => string
  activitySchedule: (count: number) => string
  activityOther: (count: number) => string
  // Time buckets
  timeNow: string
  timeMinutes: (count: number) => string
  timeHours: (count: number) => string
  timeDays: (count: number) => string
  timeMonths: (count: number) => string
  timeYears: (count: number) => string
}

/**
 * Resolve every message through one bound translate function.
 *
 * Called on each render rather than memoized: the bound function keeps a stable
 * identity across an active-locale switch, so a `useMemo` on it would keep the
 * previous language.
 * @param t - the namespace-bound translate seat the slot injects.
 * @returns the string face the derivations and components consume.
 */
export function messagesFrom(t: TranslateNS<typeof LOCALE_NS>): Messages {
  return {
    organizeTitle: t('organizeTitle'),
    addWorkspace: t('addWorkspace'),
    viewOptions: t('viewOptions'),
    expandAll: t('expandAll'),
    collapseAll: t('collapseAll'),
    savePending: t('savePending'),
    saveFailed: t('saveFailed'),
    retrySave: t('retrySave'),
    search: t('search'),
    closeSearch: t('closeSearch'),
    newGroup: t('newGroup'),
    ungroupedWorkspaces: t('ungroupedWorkspaces'),
    ungroupedSessions: t('ungroupedSessions'),
    loading: t('loading'),
    noWorkspaces: t('noWorkspaces'),
    noSessions: t('noSessions'),
    noMatches: t('noMatches'),
    emptyGroup: t('emptyGroup'),
    hideArchived: t('hideArchived'),
    showArchived: t('showArchived'),
    onlyArchived: t('onlyArchived'),
    archivedOnlyEmpty: t('archivedOnlyEmpty'),
    viewOtherSessions: t('viewOtherSessions'),
    archivedNotOpenable: t('archivedNotOpenable'),
    newSession: t('newSession'),
    blankSession: t('blankSession'),
    untitled: t('untitled'),
    defaultWorkspace: t('defaultWorkspace'),
    workspaceMenu: t('workspaceMenu'),
    groupMenu: t('groupMenu'),
    renameWorkspace: t('renameWorkspace'),
    deleteWorkspace: t('deleteWorkspace'),
    renameSession: t('renameSession'),
    archiveSession: t('archiveSession'),
    unarchive: t('unarchive'),
    renameGroup: t('renameGroup'),
    archiveGroup: t('archiveGroup'),
    deleteGroupWorkspaces: t('deleteGroupWorkspaces'),
    removeFromGroup: t('removeFromGroup'),
    moveToGroup: t('moveToGroup'),
    ungroup: t('ungroup'),
    unitWorkspaces: t('unitWorkspaces'),
    unitSessions: t('unitSessions'),
    unitRunning: t('unitRunning'),
    unitPending: t('unitPending'),
    statusApproval: t('statusApproval'),
    statusPlanReview: t('statusPlanReview'),
    statusQuestion: t('statusQuestion'),
    cancel: t('cancel'),
    ok: t('ok'),
    working: t('working'),
    close: t('close'),
    nameGroup: t('nameGroup'),
    nameWorkspace: t('nameWorkspace'),
    nameSession: t('nameSession'),
    archiveGroupBody: count => t('archiveGroupBody', { count }),
    archiveGroupRunning: count => t('archiveGroupRunning', { count }),
    deleteGroupWorkspacesBody: count => t('deleteGroupWorkspacesBody', { count }),
    deleteWorkspaceBody: t('deleteWorkspaceBody'),
    archiveConfirmTitle: t('archiveConfirmTitle'),
    archiveConfirmBody: title => t('archiveConfirmBody', { title }),
    archiveConfirmAction: t('archiveConfirmAction'),
    activityLabel: t('activityLabel'),
    activityTurn: t('activityTurn'),
    activitySubagent: count => t('activitySubagent', { count }),
    activityJob: count => t('activityJob', { count }),
    activitySchedule: count => t('activitySchedule', { count }),
    activityOther: count => t('activityOther', { count }),
    timeNow: t('timeNow'),
    timeMinutes: count => t('timeMinutes', { count }),
    timeHours: count => t('timeHours', { count }),
    timeDays: count => t('timeDays', { count }),
    timeMonths: count => t('timeMonths', { count }),
    timeYears: count => t('timeYears', { count }),
  }
}
