/**
 * Plugin copy.
 *
 * The browser follows `navigator.language` and carries the same two locales the
 * shipped workspace surface ships, so a group tree and a session row never
 * disagree about a language.
 *
 * The shell's own locale service would be the better source, but it is not on
 * the client baseline: reading it would make this bundle depend on a package the
 * module table cannot seed, for one lookup at mount. `navigator.language` is the
 * honest choice until that changes.
 */

/** Time buckets the rows date themselves with, coarsest last. */
export type TimeBucket = 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'

/** Every string this plugin renders. Functions take the interpolation values. */
export interface Messages {
  // Header
  organizeTitle: string
  addWorkspace: string
  viewOptions: string
  expandAll: string
  collapseAll: string
  savePending: string
  search: string
  closeSearch: string
  // List
  newGroup: string
  ungrouped: string
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
  showAllSessions: string
  archivedNotOpenable: string
  // Rows
  newSession: string
  blankSession: string
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
  deleteGroupWorkspacesBody: (count: number) => string
  deleteWorkspaceBody: string
  // Time buckets
  timeNow: string
  timeMinutes: (count: number) => string
  timeHours: (count: number) => string
  timeDays: (count: number) => string
  timeMonths: (count: number) => string
  timeYears: (count: number) => string
}

const EN: Messages = {
  organizeTitle: 'Workspaces',
  addWorkspace: 'Add workspace',
  viewOptions: 'View options',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  savePending: 'Saving to the Host…',
  search: 'Search sessions',
  closeSearch: 'Close search',
  newGroup: 'New group',
  ungrouped: 'Ungrouped',
  loading: 'Loading…',
  noWorkspaces: 'No workspaces yet',
  noSessions: 'No sessions',
  noMatches: 'No matches',
  emptyGroup: 'Move workspaces here from their ⋯ menu',
  hideArchived: 'Hide archived sessions',
  showArchived: 'All sessions (show archived)',
  onlyArchived: 'Only archived sessions',
  archivedOnlyEmpty: 'No archived sessions yet',
  showAllSessions: 'Show all sessions',
  archivedNotOpenable: 'Archived sessions cannot be opened. Restore it to view.',
  newSession: 'New session in this workspace',
  blankSession: 'New Session',
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
  unitRunning: 'running',
  unitPending: 'waiting',
  statusApproval: 'Approval',
  statusPlanReview: 'Plan review',
  statusQuestion: 'Answer',
  cancel: 'Cancel',
  ok: 'OK',
  working: 'Working…',
  close: 'Close',
  nameGroup: 'Group name',
  nameWorkspace: 'Workspace name',
  nameSession: 'Session name',
  archiveGroupBody: count => `All ${count} session(s) in this group will be archived. Workspaces stay.`,
  deleteGroupWorkspacesBody: count => `All ${count} workspace(s) in this group will be removed from DSH. Session logs stay on disk. This cannot be undone.`,
  deleteWorkspaceBody: 'The registration is removed from DSH. Session logs stay on disk.',
  timeNow: 'now',
  timeMinutes: count => `${count}min`,
  timeHours: count => `${count}h`,
  timeDays: count => `${count}d`,
  timeMonths: count => `${count}mo`,
  timeYears: count => `${count}y`,
}

const ZH: Messages = {
  organizeTitle: '工作区',
  addWorkspace: '添加工作区',
  viewOptions: '视图选项',
  expandAll: '展开全部',
  collapseAll: '折叠全部',
  savePending: '正在保存到 Host…',
  search: '搜索会话',
  closeSearch: '关闭搜索',
  newGroup: '新建分组',
  ungrouped: '未分组',
  loading: '加载中…',
  noWorkspaces: '暂无工作区',
  noSessions: '暂无会话',
  noMatches: '无匹配',
  emptyGroup: '从工作区的 ⋯ 菜单移入工作区',
  hideArchived: '隐藏已归档会话',
  showArchived: '全部会话(含已归档)',
  onlyArchived: '只看已归档会话',
  archivedOnlyEmpty: '暂无已归档会话',
  showAllSessions: '显示全部会话',
  archivedNotOpenable: '已归档会话暂时无法查看，请从归档恢复后再查看。',
  newSession: '在此工作区新建会话',
  blankSession: '新会话',
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
  archiveGroupBody: count => `该分组内共 ${count} 个会话将被归档。工作区保留。`,
  deleteGroupWorkspacesBody: count => `该分组内共 ${count} 个工作区将从 DSH 移除;会话日志仍保留在磁盘上。此操作不可撤销。`,
  deleteWorkspaceBody: '将从 DSH 移除该工作区登记;会话日志仍保留在磁盘上。',
  timeNow: '刚刚',
  timeMinutes: count => `${count}分钟`,
  timeHours: count => `${count}小时`,
  timeDays: count => `${count}天`,
  timeMonths: count => `${count}个月`,
  timeYears: count => `${count}年`,
}

/** The locale this browser renders in. */
export type Locale = 'en' | 'zh'

/**
 * Pick the locale from the browser language.
 * @returns `'zh'` for a Chinese browser language, `'en'` otherwise (and under
 * a test runner, where no navigator exists).
 */
export function detectLocale(): Locale {
  const language = typeof navigator === 'undefined' ? '' : navigator.language
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** The copy for one locale. */
export function messagesFor(locale: Locale): Messages {
  return locale === 'zh' ? ZH : EN
}

/** The copy this browser renders in. */
export const messages: Messages = messagesFor(detectLocale())
