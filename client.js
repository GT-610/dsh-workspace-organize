/**
 * Client half of dsh-workspace-organize.
 *
 * Shadows the shipped `sidebar.workspaces` browser (registered with
 * `priority: -100`; a single slot renders the lowest-priority live entry, so
 * the shipped entry stays registered — its declared child slots survive —
 * while this component wins the render). The tree is group > workspace >
 * session.
 *
 * Presentation mirrors the shipped WorkspaceBrowser: the same design tokens
 * (`--dsw-alias-*`, `--dsw-radius-*`, `--dsh-sidebar-inline-padding`), the same
 * row metrics (34px workspace / 32px session / 14px titles / 10px timestamps /
 * 16px leading slots / 28px header controls), and the same product icon
 * artwork. `@deepseek-ai/dsh-client-ui-primitives` is one of the shell-seeded
 * `PLATFORM_MODULES`, so it IS requirable from this factory and its icons
 * could be imported; the copies below predate that check and are kept only
 * until the primitives are adopted (see the repository README).
 *
 * A shadowing entry receives only the owner props and the global standard
 * hooks (useWorkspaces / useSessions / useSessionStatus) — the official
 * entry's injected action face is NOT forwarded. Every business operation
 * therefore goes through the official client services resolved lazily via
 * `ctx.get`: `workspaces` (rename/delete/create), `uiWorkspace` (open, start
 * session, archive, directory picking). Group state itself persists through
 * the Host route `/api/workspace-organize` with a localStorage mirror.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workspace-organize',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useMemo, useRef, useCallback } = React;
    const h = React.createElement;

    /* ------------------------------------------------------------------ *
     * Icon artwork, copied verbatim from
     * @deepseek-ai/dsh-client-ui-primitives (src/icons). Regular weight is a
     * 1px stroke; every glyph is 16x16 and paints with currentColor.
     * ------------------------------------------------------------------ */

    /**
     * Wrap product artwork in the shared 16x16 current-color svg shell.
     * @param size - rendered edge length in px.
     * @param extra - svg attributes that override the shell defaults.
     * @param children - path elements.
     * @returns the svg element.
     */
    function glyph(size, extra) {
      const children = Array.prototype.slice.call(arguments, 2);
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true',
        strokeWidth: 1, ...extra,
      }, children);
    }

    /** One artwork path. */
    const P = (d, extra) => h('path', { d, ...extra });
    /** One artwork circle. */
    const C = (cx, cy, r) => h('circle', { cx, cy, r });

    const Ico = {
      search: (s = 16) => glyph(s, null,
        P('M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z', { stroke: 'currentColor' }),
        P('M10.2991 10.3933L14.7783 14.8725', { stroke: 'currentColor' })),
      sliders: (s = 16) => glyph(s, { stroke: 'currentColor', strokeLinecap: 'round' },
        P('M2.3 5h5.85M12.05 5h1.65'), C(9.95, 5, 1.45),
        P('M2.3 11h1.65M7.85 11h5.85'), C(5.75, 11, 1.45)),
      chevronsUpDown: (s = 16) => glyph(s, { stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' },
        P('m5.1 6 2.9-2.9L10.9 6'), P('m5.1 10 2.9 2.9 2.9-2.9')),
      projectAdd: (s = 16) => glyph(s, null,
        P('M5.54492 2.06738C5.91034 2.06754 6.26318 2.20149 6.53711 2.44336L7.94043 3.68164V4.7998C7.71462 4.74105 7.50367 4.63139 7.32617 4.47461L5.87598 3.19238C5.78477 3.11185 5.66658 3.06754 5.54492 3.06738H2.94922C2.67322 3.06738 2.44946 3.29145 2.44922 3.56738V12.4326C2.44927 12.7087 2.67311 12.9326 2.94922 12.9326H12.9326C13.2086 12.9325 13.4326 12.7086 13.4326 12.4326V8.53613H14.4326V12.4326C14.4326 13.2609 13.7609 13.9325 12.9326 13.9326H2.94922C2.12083 13.9326 1.44927 13.261 1.44922 12.4326V3.56738C1.44946 2.73916 2.12094 2.06738 2.94922 2.06738H5.54492Z', { fill: 'currentColor' }),
        P('M9.75977 4.50208H14.5509', { stroke: 'currentColor' }),
        P('M12.1492 6.89758L12.1492 2.10642', { stroke: 'currentColor' })),
      folderClose: (s = 16) => glyph(s, null,
        P('M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z', { stroke: 'currentColor' }),
        P('M3.63501 7.66614H12.3647', { stroke: 'currentColor' })),
      folderOpen: (s = 16) => glyph(s, null,
        P('M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z', { fill: 'currentColor', opacity: 0.16 }),
        P('M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z', { fill: 'currentColor' }),
        P('M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z', { fill: 'currentColor' })),
      triangle: (s = 14) => glyph(s, null,
        P('M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z', { fill: 'currentColor' })),
      ellipsis: (s = 16) => glyph(s, null,
        P('M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z', { fill: 'currentColor' }),
        P('M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z', { fill: 'currentColor' }),
        P('M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z', { fill: 'currentColor' })),
      archive: (s = 16) => glyph(s, null,
        P('M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z', { stroke: 'currentColor' }),
        P('M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5', { stroke: 'currentColor' }),
        P('M6.5 9.5H9.5', { stroke: 'currentColor' })),
      unarchive: (s = 16) => h('svg', {
        width: s, height: s, viewBox: '0 0 20 20', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', strokeWidth: 1,
      },
      P('M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z', { fillRule: 'evenodd', clipRule: 'evenodd', fill: 'currentColor' }),
      P('M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05', { stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' })),
      edit: (s = 14) => glyph(s, null,
        P('M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z', { fill: 'currentColor' }),
        P('M7.7849 8.23878L13.888 2.13574', { stroke: 'currentColor' })),
      trash: (s = 14) => glyph(s, null,
        P('M1.28149 3.88831H14.7187', { stroke: 'currentColor' }),
        P('M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833', { stroke: 'currentColor' }),
        P('M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831', { stroke: 'currentColor' }),
        P('M6.44946 6.98926V11.1238', { stroke: 'currentColor' }),
        P('M9.55054 6.98926V11.1238', { stroke: 'currentColor' })),
      folderOpenPlain: (s = 14) => glyph(s, null,
        P('M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z', { stroke: 'currentColor' }),
        P('M4.76632 2.40137C5.01016 2.40137 5.24561 2.49046 5.42836 2.6519L6.94088 3.98799C7.12364 4.14943 7.35908 4.23852 7.60293 4.23852H12.3994C12.9517 4.23852 13.3994 4.68624 13.3994 5.23852V7.16991', { stroke: 'currentColor' })),
    };

    /**
     * Product state dot: a 10px box painting one 6px currentColor core, or a
     * 14px breathing ring while a session is running.
     * @param props.state - done / warning / ongoing / error / idle.
     * @param props.size - outer diameter override.
     * @returns the dot element.
     */
    function StateDot({ state, size }) {
      if (state === 'ongoing') {
        const edge = size ?? 14;
        return h('svg', {
          className: 'two-spinner', 'data-state': 'ongoing',
          width: edge, height: edge, viewBox: '0 0 24 24', 'aria-hidden': 'true',
        },
        h('g', { className: 'two-spinner-motion' },
          h('circle', { className: 'two-spinner-track', cx: 12, cy: 12, r: 9.5 }),
          h('circle', { className: 'two-spinner-arc', cx: 12, cy: 12, r: 9.5 })));
      }
      const edge = size ?? 10;
      return h('span', {
        className: 'two-dot', 'data-state': state,
        style: { width: edge, height: edge }, 'aria-hidden': 'true',
      });
    }

    /**
     * Compact relative-time bucketing, shared with the shipped rows so two
     * surfaces dating the same session never disagree.
     * @param at - epoch ms of the dated moment.
     * @param now - current epoch ms.
     * @returns the bucket plus its magnitude (0 for "now").
     */
    function relativeTime(at, now) {
      const MIN = 60000;
      const HOUR = 3600000;
      const DAY = 86400000;
      const diff = Math.max(0, now - at);
      if (diff < MIN) return { unit: 'now', n: 0 };
      if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) };
      if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) };
      if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) };
      if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) };
      return { unit: 'years', n: Math.floor(diff / (365 * DAY)) };
    }

    /** POST the group document to the Host; localStorage mirrors it always. */
    async function saveGroups(doc) {
      try { localStorage.setItem('workspaceOrganize.groups', JSON.stringify(doc)); } catch { /* private mode */ }
      try {
        const res = await fetch('/api/workspace-organize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(doc),
        });
        return res.ok;
      } catch { return false; }
    }

    /** Load the group document: Host first, localStorage as fallback cache. */
    async function loadGroups() {
      let fallback;
      try {
        const raw = localStorage.getItem('workspaceOrganize.groups');
        if (raw) fallback = JSON.parse(raw);
      } catch { /* ignore */ }
      try {
        const res = await fetch('/api/workspace-organize');
        if (res.ok) {
          const doc = await res.json();
          if (doc && Array.isArray(doc.groups)) return doc;
        }
      } catch { /* fall through */ }
      return fallback ?? { version: 1, groups: [] };
    }

    const newId = () => `g-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

    const EN = {
      organizeTitle: 'Workspaces', addWorkspace: 'Add workspace', newGroup: 'New group',
      search: 'Search sessions', ungrouped: 'Ungrouped', loading: 'Loading…',
      noWorkspaces: 'No workspaces yet', noSessions: 'No sessions', noMatches: 'No matches',
      emptyGroup: 'Move workspaces here via their ⋯ menu', newSession: 'New session in workspace',
      renameWorkspace: 'Rename workspace…', deleteWorkspace: 'Delete workspace…',
      renameSession: 'Rename session…', workspaceMenu: 'Workspace menu',
      removeFromGroup: 'Move out of group', moveToGroup: 'Move to group',
      renameGroup: 'Rename group', ungroup: 'Ungroup (keep workspaces)',
      archiveGroup: 'Archive all sessions in group…', groupMenu: 'Group menu',
      deleteGroupWorkspaces: 'Delete all workspaces in group…',
      viewOptions: 'View options', expandAll: 'Expand all', collapseAll: 'Collapse all',
      unitWorkspaces: 'workspaces', unitRunning: 'running', unitPending: 'waiting',
      closeSearch: 'Close search',
      archiveSession: 'Archive session', unarchive: 'Restore from archive',
      blankSession: 'New Session',
      archivedNotOpenable: 'Archived sessions cannot be opened',
      cancel: 'Cancel', ok: 'OK', working: 'Working…',
      dArchiveGroup: n => `All ${n} session(s) in this group will be archived. Workspaces stay.`,
      dDeleteGroupWorkspaces: n => `All ${n} workspace(s) in this group will be removed from DSH. Session logs stay on disk. This cannot be undone.`,
      dUngroup: 'Workspaces return to Ungrouped. Nothing is deleted.',
      dDeleteWs: 'The registration is removed from DSH. Session logs stay on disk.',
      nameGroup: 'Group name', nameWorkspace: 'Workspace name', nameSession: 'Session name',
      'status.compact.approval': 'Approval',
      'status.compact.plan-review': 'Plan review',
      'status.compact.question': 'Answer',
      'time.now': 'now',
      'time.minutes': n => `${n}min`,
      'time.hours': n => `${n}h`,
      'time.days': n => `${n}d`,
      'time.months': n => `${n}mo`,
      'time.years': n => `${n}y`,
    };
    const ZH = {
      organizeTitle: '工作区', addWorkspace: '添加工作区', newGroup: '新建分组',
      search: '搜索会话', ungrouped: '未分组', loading: '加载中…',
      noWorkspaces: '暂无工作区', noSessions: '暂无会话', noMatches: '无匹配',
      emptyGroup: '通过工作区的 ⋯ 菜单移入工作区', newSession: '在此工作区新建会话',
      renameWorkspace: '重命名工作区…', deleteWorkspace: '删除工作区…',
      renameSession: '重命名会话…', workspaceMenu: '工作区菜单',
      removeFromGroup: '移出分组', moveToGroup: '移入分组',
      renameGroup: '重命名分组', ungroup: '解散分组(保留工作区)',
      archiveGroup: '归档组内全部会话…', groupMenu: '分组菜单',
      deleteGroupWorkspaces: '删除组内全部工作区…',
      viewOptions: '视图选项', expandAll: '展开全部', collapseAll: '折叠全部',
      unitWorkspaces: '工作区', unitRunning: '运行中', unitPending: '待处理',
      closeSearch: '关闭搜索',
      archiveSession: '归档会话', unarchive: '从归档恢复',
      blankSession: '新会话',
      archivedNotOpenable: '已归档的会话无法打开',
      cancel: '取消', ok: '确定', working: '处理中…',
      dArchiveGroup: n => `该分组内共 ${n} 个会话将被归档。工作区保留。`,
      dDeleteGroupWorkspaces: n => `该分组内共 ${n} 个工作区将从 DSH 移除;会话日志仍保留在磁盘上。此操作不可撤销。`,
      dUngroup: '工作区将回到"未分组",不会删除任何内容。',
      dDeleteWs: '将从 DSH 移除该工作区登记;会话日志仍保留在磁盘上。',
      nameGroup: '分组名称', nameWorkspace: '工作区名称', nameSession: '会话名称',
      'status.compact.approval': '待审批',
      'status.compact.plan-review': '计划待审',
      'status.compact.question': '待回答',
      'time.now': '刚刚',
      'time.minutes': n => `${n}分钟`,
      'time.hours': n => `${n}小时`,
      'time.days': n => `${n}天`,
      'time.months': n => `${n}个月`,
      'time.years': n => `${n}年`,
    };
    const DICT = (navigator.language || '').toLowerCase().startsWith('zh') ? ZH : EN;
    const t = (key, fallback) => DICT[key] ?? fallback ?? key;

    /**
     * Loud-failure guard. A render crash in this entry makes the slot abdicate
     * and fall back to the shipped browser — and abdication unmounts the
     * crashing boundary together with its `data-slot-error` anchor, so the
     * failure leaves no trace in the DOM. Log the real error first, then
     * re-throw so the slot's own boundary still performs that fallback.
     */
    class CrashReporter extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: undefined };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        console.error('workspace-organize: grouped browser crashed', error, info);
      }

      render() {
        if (this.state.error !== undefined) throw this.state.error;
        return this.props.children;
      }
    }

    /**
     * The grouped browser. Props come from the slot runtime: shell owner share
     * (wide / expandSidebar), the global standard hooks, and the lazily
     * resolved official service face.
     */
    function GroupedBrowser(props) {
      const {
        wide,
        useWorkspaces,
        useSessions,
        useSessionStatus,
        usePanelInfo,
        services,
      } = props;

      // The standard kit hands out selector HOOKS (bound observable sources),
      // not raw sources: call them directly, exactly like the shipped browser.
      const wsSnapshot = useWorkspaces(s => s);
      const list = useSessions(s => s);
      const statuses = useSessionStatus(s => s);
      const panelActive = usePanelInfo === undefined
        ? false
        : usePanelInfo(info => info.activePanelId !== null);
      const workspaces = wsSnapshot.items;
      const workspaceReady = wsSnapshot.phase === 'ready' && wsSnapshot.state !== 'loading';
      const archived = useMemo(() => new Set(wsSnapshot.archivedSessionIds), [wsSnapshot.archivedSessionIds]);

      const [groups, setGroups] = useState(undefined); // undefined = loading
      const [query, setQuery] = useState('');
      const [searchOpen, setSearchOpen] = useState(false);
      // Explicit disclosure choices per node key (`g:<id>` / `ws:<id>`). An
      // absent key means "follow the default" — the shipped browser resolves
      // expansion the same way (`groupExpansion[key] ?? …`) instead of seeding
      // every node open, which is what buried the tree in session rows.
      const [expansion, setExpansion] = useState(() => {
        try {
          const raw = localStorage.getItem('workspaceOrganize.expansion');
          const parsed = raw === null ? undefined : JSON.parse(raw);
          return parsed !== null && typeof parsed === 'object' ? parsed : {};
        } catch { return {}; }
      });
      const [menu, setMenu] = useState(undefined);       // {items, x, y, key}
      const [dialog, setDialog] = useState(undefined);   // {kind, ...payload}
      const [busy, setBusy] = useState(false);
      const [hostSaved, setHostSaved] = useState(true);
      const [now, setNow] = useState(() => Date.now());

      useEffect(() => {
        let live = true;
        loadGroups().then((doc) => { if (live) setGroups(doc.groups ?? []); });
        return () => { live = false; };
      }, []);

      // Row timestamps bucket against a slowly advancing clock, not per render.
      useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
      }, []);

      const persist = useCallback((next) => {
        setGroups(next);
        setHostSaved(false);
        saveGroups({ version: 1, groups: next }).then((ok) => { if (ok) setHostSaved(true); });
      }, []);

      // Workspace deletions elsewhere remove ids from the group document too.
      useEffect(() => {
        if (!workspaceReady || groups === undefined) return;
        const known = new Set(workspaces.map(w => w.workspaceId));
        setGroups((current) => {
          if (current === undefined) return current;
          let changed = false;
          const next = current.map((g) => {
            const kept = g.workspaceIds.filter(id => known.has(id));
            if (kept.length === g.workspaceIds.length) return g;
            changed = true;
            return { ...g, workspaceIds: kept };
          });
          return changed ? next : current;
        });
      }, [workspaceReady, workspaces]); // eslint-disable-line react-hooks/exhaustive-deps

      const groupedIds = useMemo(
        () => new Set((groups ?? []).flatMap(g => g.workspaceIds)),
        [groups],
      );
      const ungrouped = useMemo(
        () => workspaces.filter(w => !groupedIds.has(w.workspaceId)),
        [workspaces, groupedIds],
      );

      const normalizedQuery = query.trim().toLowerCase();
      const filterSessions = useMemo(() => {
        if (normalizedQuery === '') return undefined;
        return ids => ids.filter((id) => {
          const row = list.byId[id];
          // A blank placeholder never matches a query: its canonical title is
          // the directory name, so matching it would tie search to one language.
          if (row === undefined || row.blank === true || archived.has(id)) return false;
          return row.displayTitle.toLowerCase().includes(normalizedQuery);
        });
      }, [normalizedQuery, list.byId, archived]);

      // The session the main view currently retains. This is the shipped tree's
      // own `mainSessionId`, and it doubles as the only blank session allowed a
      // row (see `sessionShown`). A docked panel takes focus away, so the
      // active-folder tint drops while one is open; blank visibility does not
      // depend on that, or opening a panel would reshuffle the tree.
      const mainSessionId = useMemo(
        () => Object.values(list.byId)
          .find(session => (session.retainedBy?.mainView ?? 0) > 0)?.id,
        [list.byId],
      );

      const currentSessionId = panelActive ? undefined : mainSessionId;

      const activeWorkspaceId = useMemo(() => {
        if (currentSessionId === undefined) return undefined;
        return workspaces.find(w => w.sessionIds.includes(currentSessionId))?.workspaceId;
      }, [currentSessionId, workspaces]);

      /** Record one node's disclosure choice so it survives a reload. */
      const persistExpansion = useCallback((next) => {
        setExpansion(next);
        try { localStorage.setItem('workspaceOrganize.expansion', JSON.stringify(next)); } catch { /* private mode */ }
      }, []);

      const setExpanded = (key, value) => {
        persistExpansion({ ...expansion, [key]: value });
      };

      /**
       * Whether a node renders its children. A search forces everything open so
       * matches are reachable; otherwise an explicit choice wins and the
       * fallback covers the untouched default.
       * @param key - the node identity.
       * @param fallback - the default when the user never chose.
       * @returns whether the node is expanded.
       */
      const isExpanded = (key, fallback) => {
        if (filterSessions !== undefined) return true;
        const explicit = expansion[key];
        return explicit === undefined ? fallback : explicit === true;
      };

      const timeLabel = (updatedAt) => {
        const { unit, n } = relativeTime(updatedAt, now);
        return unit === 'now' ? t('time.now') : t(`time.${unit}`)(n);
      };

      /**
       * Whether one session renders as a row at all.
       *
       * Ordinary sessions do. A blank one is a provisional New Session that
       * nothing has been sent to yet, and the shipped derivation
       * (`sessionVisible`) keeps exactly one of them: the one the main view
       * holds. Every other blank stays out of the list — those are the spent
       * drafts left behind by earlier "new session" clicks, and showing them is
       * what put a row named after each workspace in the tree.
       * @param id - the session to test.
       * @returns whether the row belongs in the tree.
       */
      const sessionShown = (id) => {
        const row = list.byId[id];
        if (row === undefined || archived.has(id)) return false;
        return row.blank !== true || id === mainSessionId;
      };

      const visibleSessions = (ws) => {
        const ids = ws.sessionIds.filter(sessionShown);
        if (filterSessions !== undefined) return filterSessions(ids);
        // The surviving placeholder leads its Workspace, matching the order
        // `sectionMembers` gives placeholders in the shipped tree.
        if (mainSessionId === undefined || !ids.includes(mainSessionId)) return ids;
        return [mainSessionId, ...ids.filter(id => id !== mainSessionId)];
      };

      /**
       * Visible rows that actually hold something. The blank placeholder is
       * excluded, so counts and bulk operations agree on what a "session in
       * this group" is.
       * @param ws - the workspace to read.
       * @returns its real, visible session ids.
       */
      const contentSessions = ws => visibleSessions(ws).filter(id => list.byId[id]?.blank !== true);

      const statusOf = (sessionId) => {
        const status = statuses.get(sessionId);
        if (status === undefined) return { state: 'idle', trailing: undefined };
        if (status.pendingInteraction !== undefined) {
          return {
            state: 'warning',
            trailing: t(`status.compact.${status.pendingInteraction}`),
          };
        }
        if (status.running === true) return { state: 'ongoing', trailing: undefined };
        if (status.completionUnread === true) return { state: 'done', trailing: undefined };
        return { state: 'idle', trailing: undefined };
      };

      const archiveOne = (sessionId) => {
        services.archiveSession(sessionId).catch(() => {
          // Active-work refusal: retry once with the official stop-then-archive path.
          services.archiveSession(sessionId, { stopActivity: true })
            .catch(e2 => console.warn('workspace-organize: archive refused', sessionId, e2));
        });
      };

      const indent = (depth) => ({ '--dsh-workspace-indent': `${depth * 16}px` });

      /**
       * Open a row menu. A pointer click anchors under its own button; a
       * right-click anchors at the cursor.
       * @param key - the row identity the menu belongs to.
       * @param items - the menu rows.
       * @param event - the originating event.
       */
      const openMenu = (key, items, event) => {
        let x = 12;
        let y = 12;
        if (event !== undefined && event.clientX !== undefined
          && (event.type === 'contextmenu' || event.type === 'mousedown')) {
          x = event.clientX;
          y = event.clientY;
        } else {
          const el = event?.currentTarget;
          if (el !== undefined && el !== null && typeof el.getBoundingClientRect === 'function') {
            const rect = el.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom + 4;
          }
        }
        setMenu({ key, items, x, y });
      };

      /**
       * Right-click handling for one row.
       *
       * The gesture is claimed on `contextmenu`, never on mousedown, so that it
       * composes with whatever else is installed instead of racing it. A
       * context-menu plugin that has already claimed this row stops the event
       * during the document capture phase; our handler then never runs and that
       * plugin's menu is the only one on screen. When nothing claims the row —
       * a plain web session, or a node no other plugin understands, such as our
       * group rows — the event reaches us, we suppress the platform menu and
       * show ours. Opening on mousedown would step around that arbitration and
       * stack two menus on every right-click.
       * @param key - the row identity the menu belongs to.
       * @param items - the menu rows.
       * @returns the handlers spread onto the row element.
       */
      const rowMenuProps = (key, items) => ({
        onContextMenu: (e) => {
          e.preventDefault();
          openMenu(key, items, e);
        },
      });

      const sessionRow = (sessionId, depth) => {
        const row = list.byId[sessionId];
        if (row === undefined) return null;
        // The one visible blank is a placeholder, not a conversation: it shows
        // the localized New Session label instead of its directory-derived
        // title, and it carries no verbs — renaming, forking, or archiving it
        // would all act on content that does not exist yet.
        const isBlank = row.blank === true;
        const isArchived = archived.has(sessionId);
        const status = statusOf(sessionId);
        const key = `s:${sessionId}`;
        const items = [
          isArchived
            ? { label: t('unarchive'), icon: Ico.unarchive(14), action: () => services.unarchiveSession(sessionId) }
            : { label: t('archiveSession'), icon: Ico.archive(14), action: () => archiveOne(sessionId) },
          { label: t('renameSession'), icon: Ico.edit(14), action: () => setDialog({ kind: 'renameSession', sessionId, current: row.displayTitle }) },
        ];
        return h('div', {
          key, className: `two-row two-session-row${isArchived ? ' archived' : ''}${menu?.key === key ? ' menu-open' : ''}`,
          // The shipped rows' DOM contract, so third-party integrations (row
          // menus, hit testing, automation) resolve this row the same way they
          // resolve the browser it replaces.
          role: 'treeitem', 'data-row-key': `session:${sessionId}`,
          'aria-level': 3, 'aria-selected': currentSessionId === sessionId,
          style: indent(depth), 'data-session-id': sessionId,
          onClick: () => { if (!isArchived) services.open(sessionId); },
          onDoubleClick: isBlank ? undefined : () => setDialog({ kind: 'renameSession', sessionId, current: row.displayTitle }),
          // A placeholder has no menu to offer, but its right-click is still
          // claimed so the platform menu never appears over the tree.
          ...(isBlank ? { onContextMenu: e => e.preventDefault() } : rowMenuProps(key, items)),
        },
        h('span', { className: 'two-slot' },
          !isArchived && !isBlank && status.state !== 'idle' ? h(StateDot, { state: status.state }) : null),
        h('span', { className: 'two-row-title' }, isBlank ? t('blankSession') : row.displayTitle),
        !isBlank && h('span', { className: 'two-time' }, status.trailing ?? timeLabel(row.updatedAt)),
        !isBlank && h('span', { className: 'two-actions' },
          h('button', {
            type: 'button', className: 'two-act-btn',
            title: isArchived ? t('unarchive') : t('archiveSession'),
            onClick: (e) => {
              e.stopPropagation();
              if (isArchived) services.unarchiveSession(sessionId); else archiveOne(sessionId);
            },
          }, isArchived ? Ico.unarchive(16) : Ico.archive(16))),
        );
      };

      const otherGroups = wsId => (groups ?? []).filter(g => !g.workspaceIds.includes(wsId));

      const workspaceRow = (ws, depth) => {
        const ids = visibleSessions(ws);
        const key = `ws:${ws.workspaceId}`;
        // Workspaces start collapsed — only the one holding the current session
        // opens, which is the shipped browser's own resting shape.
        const isOpen = isExpanded(key, ws.workspaceId === activeWorkspaceId);
        const isCollapsed = !isOpen;
        const items = [
          { label: t('renameWorkspace'), icon: Ico.edit(14), action: () => setDialog({ kind: 'renameWs', workspaceId: ws.workspaceId, current: ws.title }) },
          { label: t('newSession'), icon: Ico.projectAdd(14), action: () => services.startSession(ws.workspaceId) },
          { label: t('removeFromGroup'), icon: Ico.folderOpenPlain(14), action: () => { persist((groups ?? []).map(g => ({ ...g, workspaceIds: g.workspaceIds.filter(id => id !== ws.workspaceId) }))); setMenu(undefined); } },
          ...otherGroups(ws.workspaceId).map(g => ({
            label: `${t('moveToGroup')} → ${g.name}`,
            icon: Ico.folderClose(14),
            action: () => {
              persist((groups ?? []).map(cur => ({
                ...cur,
                workspaceIds: [...cur.workspaceIds.filter(id => id !== ws.workspaceId), ...(cur.id === g.id ? [ws.workspaceId] : [])],
              })));
              setMenu(undefined);
            },
          })),
          { label: t('deleteWorkspace'), icon: Ico.trash(14), danger: true, action: () => setDialog({ kind: 'confirmDeleteWs', workspaceId: ws.workspaceId, title: ws.title }) },
        ];
        return h('div', { key: ws.workspaceId, className: 'two-ws-node' },
          h('div', {
            className: `two-row two-ws-row${menu?.key === key ? ' menu-open' : ''}`,
            role: 'treeitem', 'data-row-key': `workspace:${ws.workspaceId}`,
            'aria-level': 2, 'aria-expanded': !isCollapsed, style: indent(depth),
            onClick: () => setExpanded(key, !isOpen),
            ...rowMenuProps(key, items),
          },
          h('span', { className: `two-slot two-folder${activeWorkspaceId === ws.workspaceId ? ' active' : ''}` },
            isCollapsed ? Ico.folderClose(16) : Ico.folderOpen(16)),
          h('span', { className: 'two-slot two-chev' },
            h('span', { className: `two-arrow${isCollapsed ? '' : ' open'}` }, Ico.triangle(14))),
          h('span', { className: 'two-text' },
            h('span', { className: 'two-row-title' }, ws.title)),
          h('span', { className: 'two-actions' },
            h('button', {
              type: 'button', className: 'two-act-btn', title: t('workspaceMenu', 'Workspace menu'),
              onClick: (e) => { e.stopPropagation(); openMenu(key, items, e); },
            }, Ico.ellipsis(16)),
            h('button', {
              type: 'button', className: 'two-act-btn', title: t('newSession'),
              onClick: (e) => { e.stopPropagation(); services.startSession(ws.workspaceId); },
            }, Ico.projectAdd(16)))),
          !isCollapsed && h('div', { className: 'two-ws-sessions' },
            ids.length === 0
              ? h('div', { className: 'two-empty', style: { marginLeft: (depth + 1) * 16 } },
                filterSessions ? t('noMatches') : t('noSessions'))
              : ids.map(id => sessionRow(id, depth + 1))),
        );
      };

      const groupNode = (group, depth) => {
        const key = `g:${group.id}`;
        // Groups hold no sessions of their own, so they rest open: the noise a
        // wall of identical session rows caused came from workspaces, not here.
        const isOpen = isExpanded(key, true);
        const isCollapsed = !isOpen;
        const members = group.workspaceIds
          .map(id => workspaces.find(w => w.workspaceId === id))
          .filter(Boolean);
        const sessionCount = members.reduce((acc, m) => acc + contentSessions(m).length, 0);
        // Status roll-up: how many workspaces, and how much of the group is
        // actually moving (or blocked on the user right now).
        let running = 0;
        let pending = 0;
        for (const member of members) {
          for (const sessionId of member.sessionIds) {
            if (archived.has(sessionId)) continue;
            const status = statuses.get(sessionId);
            if (status === undefined) continue;
            if (status.pendingInteraction !== undefined) pending += 1;
            else if (status.running === true) running += 1;
          }
        }
        const state = pending > 0 ? 'warning' : running > 0 ? 'ongoing' : undefined;
        const summary = [`${members.length} ${t('unitWorkspaces')}`];
        if (running > 0) summary.push(`${running} ${t('unitRunning')}`);
        const items = [
          { label: t('renameGroup'), icon: Ico.edit(14), action: () => setDialog({ kind: 'renameGroup', groupId: group.id, current: group.name }) },
          { label: t('archiveGroup'), icon: Ico.archive(14), action: () => setDialog({ kind: 'confirmArchiveGroup', groupId: group.id, name: group.name, count: sessionCount }) },
          { label: t('newGroup'), icon: Ico.projectAdd(14), action: () => setDialog({ kind: 'createGroup' }) },
          { label: t('deleteGroupWorkspaces'), icon: Ico.trash(14), danger: true, action: () => setDialog({ kind: 'confirmDeleteGroupWorkspaces', groupId: group.id, name: group.name, count: members.length }) },
          { label: t('ungroup'), icon: Ico.folderOpenPlain(14), danger: true, action: () => { persist((groups ?? []).filter(g => g.id !== group.id)); setMenu(undefined); } },
        ];
        return h('div', { key: group.id, className: 'two-group-node' },
          h('div', {
            className: `two-row two-group-row${menu?.key === key ? ' menu-open' : ''}`,
            role: 'treeitem', 'data-row-key': `group:${group.id}`,
            'aria-level': 1, 'aria-expanded': !isCollapsed, style: indent(depth),
            onClick: () => setExpanded(key, !isOpen),
            ...rowMenuProps(key, items),
          },
          h('span', { className: 'two-slot two-chev' },
            h('span', { className: `two-arrow${isCollapsed ? '' : ' open'}` }, Ico.triangle(14))),
          h('span', { className: 'two-text' },
            h('span', { className: 'two-row-title two-group-title' }, group.name)),
          h('span', {
            className: 'two-count',
            title: `${members.length} ${t('unitWorkspaces')}${running > 0 ? ` · ${running} ${t('unitRunning')}` : ''}${pending > 0 ? ` · ${pending} ${t('unitPending')}` : ''}`,
          },
          state !== undefined ? h(StateDot, { state, size: 10 }) : null,
          h('span', null, summary.join(' · '))),
          h('span', { className: 'two-actions' },
            h('button', {
              type: 'button', className: 'two-act-btn', title: t('groupMenu'),
              onClick: (e) => { e.stopPropagation(); openMenu(key, items, e); },
            }, Ico.ellipsis(16)))),
          !isCollapsed && h('div', {},
            members.length === 0
              ? h('div', { className: 'two-empty', style: { marginLeft: (depth + 1) * 16 } }, t('emptyGroup'))
              : members.map(ws => workspaceRow(ws, depth + 1))),
        );
      };

      const confirmArchiveGroup = async (groupId) => {
        const group = (groups ?? []).find(g => g.id === groupId);
        if (group === undefined) return;
        setBusy(true);
        try {
          for (const wsId of group.workspaceIds) {
            const ws = workspaces.find(w => w.workspaceId === wsId);
            if (ws === undefined) continue;
            for (const sessionId of ws.sessionIds) {
              // Archived rows are already archived, and a blank placeholder has
              // no content to archive: exactly the members the count promised.
              if (archived.has(sessionId) || list.byId[sessionId]?.blank === true) continue;
              await services.archiveSession(sessionId)
                .catch(() => services.archiveSession(sessionId, { stopActivity: true }))
                .catch(e2 => console.warn('workspace-organize: archive refused', sessionId, e2));
            }
          }
        } finally {
          setBusy(false);
          setDialog(undefined);
        }
      };

      const confirmDeleteGroupWorkspaces = async (groupId) => {
        const group = (groups ?? []).find(g => g.id === groupId);
        if (group === undefined) return;
        setBusy(true);
        try {
          for (const wsId of group.workspaceIds) {
            await services.deleteWorkspace(wsId).catch(e => console.warn('workspace-organize: delete failed', wsId, e));
          }
          persist((groups ?? []).filter(g => g.id !== groupId));
        } finally {
          setBusy(false);
          setDialog(undefined);
        }
      };

      const addWorkspace = () => {
        services.pickDirectory().then((path) => {
          if (path) return services.createWorkspace({ path });
          return undefined;
        }).catch(err => console.warn('workspace-organize: add workspace failed', err));
      };

      /** Pin every node open or shut, overwriting earlier per-node choices. */
      const setAllExpanded = (value) => {
        const next = {};
        for (const group of groups ?? []) next[`g:${group.id}`] = value;
        for (const workspace of workspaces) next[`ws:${workspace.workspaceId}`] = value;
        persistExpansion(next);
      };
      const expandAll = () => setAllExpanded(true);
      const collapseAll = () => setAllExpanded(false);

      const viewItems = [
        { label: t('newGroup'), icon: Ico.projectAdd(14), action: () => setDialog({ kind: 'createGroup' }) },
        { label: t('expandAll'), icon: Ico.chevronsUpDown(14), action: expandAll },
        { label: t('collapseAll'), icon: Ico.chevronsUpDown(14), action: collapseAll },
      ];

      const pendingLoad = groups === undefined || !workspaceReady;

      return h('div', { className: `two-browse${wide ? '' : ' rail'}` },
        h('style', null, STYLES),
        h('div', { className: 'two-header' },
          h('span', { className: `two-head-label${searchOpen ? ' hidden' : ''}` }, t('organizeTitle')),
          h('div', { className: `two-search-slot${searchOpen ? ' open' : ''}` },
            h('div', { className: `two-search${searchOpen ? ' open' : ''}` },
              h('button', {
                type: 'button', className: 'two-icon-btn two-search-btn',
                title: searchOpen ? t('closeSearch') : t('search'),
                onClick: () => {
                  setSearchOpen(v => !v);
                  if (searchOpen) setQuery('');
                },
              }, Ico.search(16)),
              searchOpen && h('input', {
                className: 'two-search-input', autoFocus: true,
                placeholder: t('search'), value: query,
                onChange: e => setQuery(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Escape') { setSearchOpen(false); setQuery(''); } },
              }))),
          h('div', { className: `two-head-actions${searchOpen ? ' hidden' : ''}` },
            h('button', {
              type: 'button', className: 'two-icon-btn', title: t('viewOptions'),
              onClick: (e) => { e.stopPropagation(); openMenu('view', viewItems, e); },
            }, Ico.sliders(16)),
            h('button', {
              type: 'button', className: 'two-icon-btn', title: t('addWorkspace'),
              onClick: addWorkspace,
            }, Ico.projectAdd(16)),
            !hostSaved && h('span', { className: 'two-saving', title: 'Host save pending' }, '…'))),
        pendingLoad
          ? h('div', { className: 'two-empty' }, t('loading'))
          : h('div', { className: 'two-list' }, [
            ...(groups ?? []).map(g => groupNode(g, 0)),
            (groups ?? []).length > 0 && ungrouped.length > 0
              && h('div', { key: 'sep', className: 'two-sep' }, t('ungrouped')),
            ...ungrouped.map(ws => workspaceRow(ws, 0)),
            (groups ?? []).length === 0 && ungrouped.length === 0
              && h('div', { className: 'two-empty' }, t('noWorkspaces')),
          ]),
        menu !== undefined && h(MenuOverlay, {
          at: { x: menu.x, y: menu.y }, items: menu.items,
          onClose: () => setMenu(undefined),
        }),
        dialog !== undefined && h(DialogHost, {
          dialog, busy, close: () => { if (!busy) setDialog(undefined); },
          onConfirm: (payload) => {
            switch (dialog.kind) {
              case 'createGroup': {
                const name = payload.name.trim();
                if (name !== '') persist([...(groups ?? []), { id: newId(), name, workspaceIds: [] }]);
                setDialog(undefined);
                break;
              }
              case 'renameGroup': {
                const name = payload.name.trim();
                if (name !== '') persist((groups ?? []).map(g => (g.id === dialog.groupId ? { ...g, name } : g)));
                setDialog(undefined);
                break;
              }
              case 'renameWs': {
                const name = payload.name.trim();
                if (name !== '' && name !== dialog.current) {
                  services.renameWorkspace(dialog.workspaceId, name)
                    .catch(err => console.warn('workspace-organize: rename failed', err));
                }
                setDialog(undefined);
                break;
              }
              case 'renameSession': {
                const name = payload.name.trim();
                if (name !== '' && name !== dialog.current) {
                  services.renameSession(dialog.sessionId, name)
                    .catch(err => console.warn('workspace-organize: session rename failed', err));
                }
                setDialog(undefined);
                break;
              }
              case 'confirmArchiveGroup': void confirmArchiveGroup(dialog.groupId); break;
              case 'confirmDeleteGroupWorkspaces': void confirmDeleteGroupWorkspaces(dialog.groupId); break;
              case 'confirmDeleteWs':
                services.deleteWorkspace(dialog.workspaceId)
                  .catch(err => console.warn('workspace-organize: delete failed', err))
                  .finally(() => setDialog(undefined));
                break;
              default: setDialog(undefined);
            }
          },
        }),
      );
    }

    /**
     * Dropdown card on the shared menu surface. Anchored at the pointer for a
     * right-click and under the trigger button otherwise, then clamped so the
     * card never leaves the viewport.
     */
    function MenuOverlay({ at, items, onClose }) {
      const ref = useRef(null);
      const [pos, setPos] = useState(() => ({ left: at.x, top: at.y, ready: false }));

      React.useLayoutEffect(() => {
        const el = ref.current;
        if (el === null) return;
        const rect = el.getBoundingClientRect();
        const margin = 8;
        setPos({
          left: Math.max(margin, Math.min(at.x, window.innerWidth - rect.width - margin)),
          top: Math.max(margin, Math.min(at.y, window.innerHeight - rect.height - margin)),
          ready: true,
        });
      }, [at.x, at.y, items.length]);

      useEffect(() => {
        const onDoc = (e) => { if (ref.current !== null && !ref.current.contains(e.target)) onClose(); };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onDoc);
          document.removeEventListener('keydown', onKey);
        };
      }, [onClose]);

      return h('div', {
        className: 'two-menu', ref,
        style: { left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' },
        onContextMenu: e => e.preventDefault(),
      }, items.map((item, i) => h('button', {
        key: i,
        type: 'button',
        className: `two-menu-item${item.danger ? ' danger' : ''}`,
        onClick: () => { onClose(); item.action(); },
      },
      item.icon !== undefined && h('span', { className: 'two-menu-ico' }, item.icon),
      h('span', { className: 'two-menu-label' }, item.label))));
    }

    /** Modal text/confirm dialog for group operations. */
    function DialogHost({ dialog, busy, close, onConfirm }) {
      const [name, setName] = useState(dialog.current ?? '');
      const isText = dialog.kind === 'createGroup' || dialog.kind === 'renameGroup'
        || dialog.kind === 'renameWs' || dialog.kind === 'renameSession';
      const labels = {
        createGroup: [t('newGroup'), t('nameGroup')],
        renameGroup: [t('renameGroup'), t('nameGroup')],
        renameWs: [t('renameWorkspace'), t('nameWorkspace')],
        renameSession: [t('renameSession'), t('nameSession')],
        confirmArchiveGroup: [`${t('archiveGroup').replace('…', '')} — ${dialog.name}`, t('dArchiveGroup')(dialog.count)],
        confirmDeleteGroupWorkspaces: [`${t('deleteGroupWorkspaces').replace('…', '')} — ${dialog.name}`, t('dDeleteGroupWorkspaces')(dialog.count)],
        confirmDeleteWs: [`${t('deleteWorkspace').replace('…', '')} — ${dialog.title}`, t('dDeleteWs')],
      };
      const [title, body] = labels[dialog.kind] ?? ['', ''];
      return h('div', { className: 'two-dialog-back', onMouseDown: e => { if (e.target === e.currentTarget) close(); } },
        h('div', { className: 'two-dialog' },
          h('div', { className: 'two-dialog-title' }, title),
          isText
            ? h('input', {
              className: 'two-dialog-input', autoFocus: true, value: name,
              placeholder: body,
              onChange: e => setName(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter' && name.trim() !== '') onConfirm({ name });
                if (e.key === 'Escape') close();
              },
            })
            : h('div', { className: 'two-dialog-body' }, body),
          h('div', { className: 'two-dialog-actions' },
            h('button', { type: 'button', className: 'two-btn', disabled: busy, onClick: close }, t('cancel')),
            h('button', {
              type: 'button',
              className: `two-btn primary${dialog.kind.startsWith('confirmDelete') ? ' danger' : ''}`,
              disabled: busy || (isText && name.trim() === ''),
              onClick: () => onConfirm({ name }),
            }, busy ? t('working') : t('ok'))),
        ),
      );
    }

    /* Metrics, tokens and icon sizes mirror the shipped WorkspaceBrowser /
     * Rows stylesheets; every custom property is a real theme token. */
    const STYLES = `
.two-browse { --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding, 0px); --two-scrollbar-w: 5px; --two-scrollbar-off: 2px; flex:1; min-height:0; display:flex; flex-direction:column; box-sizing:border-box; padding-right:var(--dsh-session-list-edge-inset); color:var(--dsw-alias-label-primary); }
.two-browse.rail { padding-right:0; }

.two-header { flex:none; display:flex; align-items:center; justify-content:flex-end; gap:4px; height:36px; padding-left:4px; margin-bottom:4px; box-sizing:border-box; border-radius:var(--dsw-radius-md,12px); overflow:hidden; color:var(--dsw-alias-label-tertiary); }
.two-browse:not(.rail) .two-header { margin-top:2px; margin-right:-4px; }
.two-head-label { flex:none; max-width:45%; min-width:0; overflow:hidden; white-space:nowrap; line-height:20px; transition:max-width 180ms var(--ds-ease-in-out,ease), opacity 120ms var(--ds-ease-in-out,ease); }
.two-head-label.hidden { max-width:0; opacity:0; }
.two-saving { flex:none; opacity:.6; }
.two-icon-btn { flex:none; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:none; border-radius:var(--dsw-radius-sm,8px); padding:0; background:transparent; cursor:pointer; color:var(--dsw-alias-label-secondary); }
.two-icon-btn:hover { background:var(--dsw-alias-interactive-bg-hover); }
.two-search-slot { flex:1; max-width:28px; min-width:0; display:flex; align-items:center; margin-left:auto; box-sizing:border-box; transition:max-width 180ms var(--ds-ease-in-out,ease); }
.two-search-slot.open { max-width:100%; }
.two-search { flex:none; display:flex; align-items:center; width:100%; height:28px; box-sizing:border-box; border:none; border-radius:var(--dsw-radius-sm,8px); background:transparent; color:var(--dsw-alias-label-secondary); overflow:hidden; }
.two-search.open { height:30px; padding:0 4px 0 0; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md,12px); }
.two-search-input { flex:1; width:0; min-width:0; border:none; outline:none; background:transparent; font-size:13px; line-height:18px; color:var(--dsw-alias-label-primary); }
.two-search-input::placeholder { color:var(--dsw-alias-label-tertiary); }
.two-head-actions { flex:none; display:flex; align-items:center; gap:4px; max-width:60px; overflow:hidden; transition:max-width 180ms var(--ds-ease-in-out,ease), opacity 120ms var(--ds-ease-in-out,ease); }
.two-head-actions.hidden { max-width:0; opacity:0; pointer-events:none; }
.two-browse.rail .two-header { gap:0; padding-left:0; margin-bottom:12px; justify-content:flex-start; }
.two-browse.rail .two-icon-btn { width:36px; height:36px; border-radius:var(--dsw-radius-md,12px); color:var(--dsw-alias-label-primary); }
.two-browse.rail .two-head-label { display:none; }
.two-browse.rail .two-head-actions { max-width:none; }
.two-browse.rail .two-search-slot { max-width:36px; }
.two-browse.rail .two-search, .two-browse.rail .two-search-btn { width:36px; height:36px; border-radius:var(--dsw-radius-md,12px); }

.two-list { flex:1; min-height:0; overflow-y:auto; margin-left:-4px; margin-right:var(--two-scrollbar-off); padding-left:4px; padding-right:calc(var(--dsh-session-list-edge-inset) - var(--two-scrollbar-w) - var(--two-scrollbar-off)); padding-bottom:16px; scrollbar-gutter:stable; }
.two-browse.rail .two-list { margin-left:0; margin-right:0; padding-left:0; padding-right:0; }
.two-sep { margin:10px 8px 4px; font-size:11px; line-height:15px; color:var(--dsw-alias-label-tertiary); }

.two-row { display:flex; align-items:center; gap:6px; box-sizing:border-box; border-radius:var(--dsw-radius-md,12px); padding:0 8px; padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px)); cursor:pointer; user-select:none; color:var(--dsw-alias-label-primary); }
.two-row:hover, .two-row.menu-open { background:var(--dsw-alias-interactive-bg-hover); }
.two-ws-row, .two-group-row { height:34px; }
.two-session-row { height:32px; gap:0; }
.two-group-node + .two-group-node, .two-ws-node + .two-ws-node { margin-top:2px; }
.two-group-node { margin-bottom:4px; }

.two-slot { flex:none; width:16px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-tertiary); }
.two-folder.active { color:var(--dsw-alias-state-business-primary); }
.two-chev { color:var(--dsw-alias-label-caption); }
.two-arrow { display:inline-flex; transition:transform 150ms var(--ds-ease-in-out,ease); }
.two-arrow.open { transform:rotate(90deg); }
.two-ws-row .two-chev { display:none; }
.two-ws-row:hover .two-chev, .two-ws-row.menu-open .two-chev { display:inline-flex; }
.two-ws-row:hover .two-folder, .two-ws-row.menu-open .two-folder { display:none; }

.two-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.two-row-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; line-height:20px; }
.two-group-title { font-weight:600; }
.two-session-row .two-row-title { flex:1; margin:0 6px 0 4px; }
.two-count, .two-time { flex:none; font-size:10px; line-height:16px; color:var(--dsw-alias-label-tertiary); }
.two-count { display:inline-flex; align-items:center; gap:4px; }
.two-session-row.archived .two-row-title { color:var(--dsw-alias-label-caption); }
.two-empty { padding:16px 12px; font-size:13px; line-height:20px; color:var(--dsw-alias-label-tertiary); }
.two-ws-sessions { display:flex; flex-direction:column; }
.two-ws-sessions > * + * { margin-top:2px; }

.two-actions { flex:none; display:none; align-items:center; gap:15px; }
.two-row:hover .two-actions, .two-row.menu-open .two-actions { display:inline-flex; }
.two-act-btn { flex:none; display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border:none; border-radius:var(--dsw-radius-xs,4px); padding:0; background:transparent; cursor:pointer; color:var(--dsw-alias-label-tertiary); }
.two-act-btn:hover { color:var(--dsw-alias-label-primary); }
.two-row:hover .two-time, .two-row.menu-open .two-time, .two-row:hover .two-count, .two-row.menu-open .two-count { display:none; }

.two-dot { position:relative; display:inline-block; flex:none; color:var(--dsw-alias-state-idle-primary); }
.two-dot::after { content:''; position:absolute; inset:20%; border-radius:50%; background:currentColor; }
.two-dot[data-state='done'] { color:var(--dsw-alias-state-success-primary); }
.two-dot[data-state='warning'] { color:var(--dsw-alias-state-warn-primary); }
.two-dot[data-state='error'] { color:var(--dsw-alias-state-error-primary); }
.two-spinner { flex:none; color:var(--dsw-alias-label-tertiary); }
.two-spinner-motion { transform-origin:center; animation:two-spin 1.5s linear infinite; }
.two-spinner-track, .two-spinner-arc { fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
.two-spinner-track { opacity:.25; }
.two-spinner-arc { stroke-dasharray:12 150; animation:two-dash 1.5s ease-in-out infinite; }
@keyframes two-spin { to { transform:rotate(360deg); } }
@keyframes two-dash { 0% { stroke-dasharray:12 150; stroke-dashoffset:0; } 50% { stroke-dasharray:24 150; stroke-dashoffset:-6; } 100% { stroke-dasharray:12 150; stroke-dashoffset:0; } }
@media (prefers-reduced-motion: reduce) { .two-spinner-motion, .two-spinner-arc { animation:none; } .two-spinner-arc { stroke-dasharray:18 150; stroke-dashoffset:-3; } }

.two-menu { position:fixed; z-index:1100; box-sizing:border-box; padding:4px; display:flex; flex-direction:column; min-width:144px; max-width:360px; border-radius:var(--dsw-radius-lg,16px); background:var(--dsw-menu-surface-fill); backdrop-filter:var(--dsw-menu-backdrop-filter); box-shadow:var(--dsw-elevation-prominent); color:var(--dsw-alias-label-primary); }
.two-menu-item { display:flex; align-items:center; gap:6px; width:100%; min-height:34px; padding:6px 8px; border:none; border-radius:var(--dsw-radius-md,12px); background:transparent; cursor:pointer; font-size:13px; line-height:20px; color:var(--dsw-alias-label-primary); text-align:left; }
.two-menu-item:hover { background:var(--dsw-alias-interactive-bg-hover); }
.two-menu-item.danger { color:var(--dsw-alias-state-error-primary); }
.two-menu-item.danger:hover { background:var(--dsw-alias-interactive-bg-hover-danger); }
.two-menu-ico { display:inline-flex; flex:none; width:14px; height:14px; align-items:center; justify-content:center; color:var(--dsw-alias-menu-icon); }
.two-menu-item.danger .two-menu-ico { color:var(--dsw-alias-state-error-primary); }
.two-menu-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.two-dialog-back { position:fixed; inset:0; z-index:1000; background:#0006; display:flex; align-items:center; justify-content:center; }
.two-dialog { box-sizing:border-box; background:var(--dsw-menu-surface-fill,#22262e); border:0.5px solid var(--dsw-alias-border-l1,#8884); border-radius:var(--dsw-radius-lg,16px); box-shadow:var(--dsw-elevation-prominent); padding:20px; min-width:360px; max-width:460px; color:var(--dsw-alias-label-primary); }
.two-dialog-title { font-size:15px; line-height:22px; font-weight:600; margin-bottom:8px; }
.two-dialog-body { font-size:13px; line-height:20px; color:var(--dsw-alias-label-secondary); margin-bottom:16px; }
.two-dialog-input { box-sizing:border-box; width:100%; height:44px; padding:7px 14px; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-lg,16px); outline:none; background:transparent; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); margin-bottom:16px; }
.two-dialog-actions { display:flex; justify-content:flex-end; gap:8px; }
.two-btn { border:1px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-button-elevated-fill,transparent); color:var(--dsw-alias-label-primary); border-radius:var(--dsw-radius-sm,8px); padding:7px 16px; font-size:14px; line-height:20px; cursor:pointer; }
.two-btn.primary { background:var(--dsw-alias-state-business-primary); border-color:transparent; color:#fff; }
.two-btn.danger { background:var(--dsw-alias-state-error-primary); border-color:transparent; color:#fff; }
.two-btn:disabled { opacity:.5; cursor:default; }
`;

    return {
      inject: ['slots'],
      apply(ctx) {
        // Official business services, resolved lazily so activation order and
        // optional availability never break this entry's mount.
        const services = {
          open: (sessionId) => { ctx.get('uiWorkspace')?.openSession(sessionId); },
          startSession: (workspaceId) => {
            ctx.get('uiWorkspace')?.startSession(workspaceId, { clearPreviousDraft: false })
              ?? ctx.get('workspaces'); // no-op when uiWorkspace is absent
          },
          archiveSession: (sessionId, options) => {
            const ui = ctx.get('uiWorkspace');
            const ws = ctx.get('workspaces');
            return ui !== undefined ? ui.archiveSession(sessionId, options) : ws.archiveSession(sessionId, options);
          },
          unarchiveSession: (sessionId) => {
            const ui = ctx.get('uiWorkspace');
            return ui !== undefined ? ui.unarchiveSession(sessionId) : ctx.get('workspaces').unarchiveSession(sessionId);
          },
          renameWorkspace: (workspaceId, title) => ctx.get('workspaces').rename(workspaceId, title).then(() => undefined),
          renameSession: async (sessionId, title) => {
            // The shipped rename route: the session controller lends a
            // reference whose binding owns the rename, so the Host applies it
            // through the same operation source the official dialog uses.
            const sessions = ctx.get('sessions');
            if (sessions === undefined || sessions.using === undefined) {
              throw new Error('sessions service is unavailable');
            }
            const result = await sessions.using(
              sessionId,
              { source: 'workspaceOperation' },
              reference => reference.binding.session.rename(title),
            );
            if (!result.ok) throw new Error(result.error?.message ?? 'rename failed');
          },
          deleteWorkspace: workspaceId => ctx.get('workspaces').delete(workspaceId),
          createWorkspace: input => ctx.get('workspaces').create(input),
          pickDirectory: () => {
            const ui = ctx.get('uiWorkspace');
            if (ui !== undefined) return ui.pickDirectory();
            return ctx.get('remote').directoryPicker.pick().then(path => path, () => null);
          },
        };

        ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
          {
            name: 'sidebar.workspaces',
            priority: -100,
          },
          function GroupedBrowserBound(runtimeProps) {
            return h(CrashReporter, null, h(GroupedBrowser, { ...runtimeProps, services }));
          },
        ));
      },
    };
  },
});
