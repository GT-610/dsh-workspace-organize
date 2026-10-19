/**
 * Client half of dsh-workspace-organize.
 *
 * Shadows the shipped `sidebar.workspaces` browser (registered with
 * `priority: -100`; a single slot renders the lowest-priority live entry, so
 * the shipped entry stays mounted — its declared child slots survive — while
 * this component wins the render). The tree is group > workspace > session.
 *
 * A shadowing entry receives only the owner props and the global standard
 * hooks (useWorkspaces / useSessions / useSessionStatus) — the official
 * entry's injected action face is NOT forwarded. Every business operation
 * therefore goes through the official client services resolved lazily via
 * `ctx.get`: `workspaces` (rename/delete/archive), `uiWorkspace` (open,
 * start session, directory picking). Group state itself persists through the
 * Host route `/api/workspace-organize` with a localStorage mirror.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workspace-organize',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useMemo, useRef, useCallback } = React;
    const h = React.createElement;

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

    const ICONS = { chevron: '▾', plus: '+', dots: '⋯', archive: '⌸', restore: '↩' };

    const EN = {
      organizeTitle: 'Workspaces', addWorkspace: 'Add workspace', newGroup: 'New group',
      search: 'Search sessions', ungrouped: 'Ungrouped', loading: 'Loading…',
      noWorkspaces: 'No workspaces yet', noSessions: 'No sessions', noMatches: 'No matches',
      emptyGroup: 'Move workspaces here via their ⋯ menu', newSession: 'New session in workspace',
      renameWorkspace: 'Rename workspace…', deleteWorkspace: 'Delete workspace…',
      removeFromGroup: 'Move out of group', moveToGroup: 'Move to group',
      renameGroup: 'Rename group', ungroup: 'Ungroup (keep workspaces)',
      archiveGroup: 'Archive all sessions in group…', groupMenu: 'Group menu',
      archiveSession: 'Archive session', unarchive: 'Restore from archive',
      archivedNotOpenable: 'Archived sessions cannot be opened',
      cancel: 'Cancel', ok: 'OK', working: 'Working…',
      dArchiveGroup: n => `All ${n} session(s) in this group will be archived. Workspaces stay.`,
      dUngroup: 'Workspaces return to Ungrouped. Nothing is deleted.',
      dDeleteWs: 'The registration is removed from DSH. Session logs stay on disk.',
      nameGroup: 'Group name', nameWorkspace: 'Workspace name',
    };
    const ZH = {
      organizeTitle: '工作区', addWorkspace: '添加工作区', newGroup: '新建分组',
      search: '搜索会话', ungrouped: '未分组', loading: '加载中…',
      noWorkspaces: '暂无工作区', noSessions: '暂无会话', noMatches: '无匹配',
      emptyGroup: '通过工作区的 ⋯ 菜单移入工作区', newSession: '在此工作区新建会话',
      renameWorkspace: '重命名工作区…', deleteWorkspace: '删除工作区…',
      removeFromGroup: '移出分组', moveToGroup: '移入分组',
      renameGroup: '重命名分组', ungroup: '解散分组(保留工作区)',
      archiveGroup: '归档组内全部会话…', groupMenu: '分组菜单',
      archiveSession: '归档会话', unarchive: '从归档恢复',
      archivedNotOpenable: '已归档的会话无法打开',
      cancel: '取消', ok: '确定', working: '处理中…',
      dArchiveGroup: n => `该分组内共 ${n} 个会话将被归档。工作区保留。`,
      dUngroup: '工作区将回到"未分组",不会删除任何内容。',
      dDeleteWs: '将从 DSH 移除该工作区登记;会话日志仍保留在磁盘上。',
      nameGroup: '分组名称', nameWorkspace: '工作区名称',
    };
    const DICT = (navigator.language || '').toLowerCase().startsWith('zh') ? ZH : EN;
    const t = (key, fallback) => DICT[key] ?? fallback ?? key;

    /**
     * The grouped browser. Props come from the slot runtime: shell owner share
     * (wide / expandSidebar) and the global standard hooks.
     */
    function GroupedBrowser(props) {
      const {
        wide,
        useWorkspaces,
        useSessions,
        useSessionStatus,
        services,
      } = props;

      // The standard kit hands out selector HOOKS (bound observable sources),
      // not raw sources: call them directly, exactly like the shipped browser.
      const wsSnapshot = useWorkspaces(s => s);
      const list = useSessions(s => s);
      const statuses = useSessionStatus(s => s);
      const workspaces = wsSnapshot.items;
      const workspaceReady = wsSnapshot.phase === 'ready' && wsSnapshot.state !== 'loading';
      const archived = useMemo(() => new Set(wsSnapshot.archivedSessionIds), [wsSnapshot.archivedSessionIds]);

      const [groups, setGroups] = useState(undefined); // undefined = loading
      const [query, setQuery] = useState('');
      const [collapsed, setCollapsed] = useState(() => new Set());
      const [menuFor, setMenuFor] = useState(undefined); // `${kind}:${id}`
      const [dialog, setDialog] = useState(undefined);   // {kind, ...payload}
      const [busy, setBusy] = useState(false);
      const [hostSaved, setHostSaved] = useState(true);

      useEffect(() => {
        let live = true;
        loadGroups().then((doc) => { if (live) setGroups(doc.groups ?? []); });
        return () => { live = false; };
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
          if (row === undefined || archived.has(id)) return false;
          return row.displayTitle.toLowerCase().includes(normalizedQuery);
        });
      }, [normalizedQuery, list.byId, archived]);

      const toggle = (key) => setCollapsed((cur) => {
        const next = new Set(cur);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });

      const archiveOne = (sessionId) => {
        services.archiveSession(sessionId).catch((error) => {
          // Active-work refusal: retry once with the official stop-then-archive path.
          services.archiveSession(sessionId, { stopActivity: true })
            .catch(e2 => console.warn('workspace-organize: archive refused', sessionId, e2));
        });
      };

      const sessionRow = (sessionId, depth) => {
        const row = list.byId[sessionId];
        if (row === undefined) return null;
        const status = statuses.get(sessionId);
        const isArchived = archived.has(sessionId);
        const running = status?.running === true;
        const pending = status?.pendingInteraction !== undefined;
        const unread = status?.completionUnread === true;
        const dot = pending ? '#e6b422' : running ? '#4a9df8' : unread ? '#3fbf7f' : undefined;
        return h('div', {
          key: sessionId, className: 'two-row session', style: { marginLeft: depth * 14 },
          onClick: () => { if (!isArchived) services.open(sessionId); },
          title: isArchived ? t('archivedNotOpenable') : row.displayTitle,
        },
          h('span', { className: 'row-dot', style: dot ? { background: dot } : undefined }),
          h('span', { className: `row-title${isArchived ? ' archived' : ''}` }, row.displayTitle),
          isArchived
            ? h('button', {
              className: 'row-btn', title: t('unarchive'),
              onClick: e => { e.stopPropagation(); services.unarchiveSession(sessionId); },
            }, ICONS.restore)
            : h('button', {
              className: 'row-btn', title: t('archiveSession'),
              onClick: e => { e.stopPropagation(); archiveOne(sessionId); },
            }, ICONS.archive),
        );
      };

      const otherGroups = wsId => (groups ?? []).filter(g => !g.workspaceIds.includes(wsId));

      const workspaceRow = (ws, depth) => {
        const allIds = filterSessions ? filterSessions(ws.sessionIds) : ws.sessionIds.filter(id => !archived.has(id));
        const key = `ws:${ws.workspaceId}`;
        const isCollapsed = collapsed.has(key) && !filterSessions;
        return h('div', { key: ws.workspaceId, className: 'ws-node' },
          h('div', { className: 'two-row ws-row', style: { marginLeft: depth * 14 } },
            h('button', {
              className: 'chev',
              style: { transform: isCollapsed ? 'rotate(-90deg)' : undefined },
              'aria-label': 'toggle',
              onClick: () => toggle(key),
            }, ICONS.chevron),
            h('span', { className: 'row-title ws-title' }, ws.title),
            h('button', {
              className: 'row-btn', title: t('newSession'),
              onClick: e => { e.stopPropagation(); services.startSession(ws.workspaceId); },
            }, ICONS.plus),
            h('button', {
              className: 'row-btn',
              onClick: e => { e.stopPropagation(); setMenuFor(menuFor === key ? undefined : key); },
            }, ICONS.dots),
          ),
          !isCollapsed && h('div', { className: 'ws-sessions' }, [
            ...allIds.map(id => sessionRow(id, depth + 1)),
            allIds.length === 0 && h('div', {
              key: 'empty', className: 'empty', style: { marginLeft: (depth + 1) * 14 },
            }, filterSessions ? t('noMatches') : t('noSessions')),
          ]),
          menuFor === key && h(MenuOverlay, {
            key: 'menu', onClose: () => setMenuFor(undefined),
            items: [
              { label: t('renameWorkspace'), action: () => setDialog({ kind: 'renameWs', workspaceId: ws.workspaceId, current: ws.title }) },
              { label: t('removeFromGroup'), action: () => { persist((groups ?? []).map(g => ({ ...g, workspaceIds: g.workspaceIds.filter(id => id !== ws.workspaceId) }))); setMenuFor(undefined); } },
              ...otherGroups(ws.workspaceId).map(g => ({
                label: `${t('moveToGroup')} → ${g.name}`,
                action: () => {
                  persist((groups ?? []).map(cur => ({
                    ...cur,
                    workspaceIds: [...cur.workspaceIds.filter(id => id !== ws.workspaceId), ...(cur.id === g.id ? [ws.workspaceId] : [])],
                  })));
                  setMenuFor(undefined);
                },
              })),
              { label: t('deleteWorkspace'), danger: true, action: () => setDialog({ kind: 'confirmDeleteWs', workspaceId: ws.workspaceId, title: ws.title }) },
            ],
          }),
        );
      };

      const groupNode = (group) => {
        const key = `g:${group.id}`;
        const isCollapsed = collapsed.has(key) && !filterSessions;
        const members = group.workspaceIds
          .map(id => workspaces.find(w => w.workspaceId === id))
          .filter(Boolean);
        const sessionCount = members.reduce(
          (acc, m) => acc + (filterSessions ? filterSessions(m.sessionIds).length : m.sessionIds.filter(id => !archived.has(id)).length),
          0,
        );
        return h('div', { key: group.id, className: 'group-node' },
          h('div', { className: 'two-row group-row' },
            h('button', {
              className: 'chev group-chev',
              style: { transform: isCollapsed ? 'rotate(-90deg)' : undefined },
              'aria-label': 'toggle',
              onClick: () => toggle(key),
            }, ICONS.chevron),
            h('span', { className: 'row-title group-title' }, group.name),
            h('span', { className: 'count' }, String(sessionCount)),
            h('button', {
              className: 'row-btn', title: t('archiveGroup'),
              onClick: e => { e.stopPropagation(); setDialog({ kind: 'confirmArchiveGroup', groupId: group.id, name: group.name, count: sessionCount }); },
            }, ICONS.archive),
            h('button', {
              className: 'row-btn', title: t('groupMenu'),
              onClick: e => { e.stopPropagation(); setMenuFor(menuFor === key ? undefined : key); },
            }, ICONS.dots),
          ),
          !isCollapsed && h('div', {}, [
            ...members.map(ws => workspaceRow(ws, 1)),
            members.length === 0 && h('div', { key: 'empty', className: 'empty', style: { marginLeft: 14 } }, t('emptyGroup')),
          ]),
          menuFor === key && h(MenuOverlay, {
            key: 'menu', onClose: () => setMenuFor(undefined),
            items: [
              { label: t('renameGroup'), action: () => setDialog({ kind: 'renameGroup', groupId: group.id, current: group.name }) },
              {
                label: t('ungroup'),
                danger: true,
                action: () => { persist((groups ?? []).filter(g => g.id !== group.id)); setMenuFor(undefined); },
              },
            ],
          }),
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
              if (archived.has(sessionId)) continue;
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

      const pendingLoad = groups === undefined || !workspaceReady;

      return h('div', { className: `two-browse${wide ? ' wide' : ' rail'}` },
        h('style', null, STYLES),
        h('div', { className: 'two-header' },
          h('span', { className: 'two-title' }, t('organizeTitle')),
          !hostSaved && h('span', { className: 'two-saving', title: 'Host save pending' }, '…'),
          h('button', { className: 'row-btn always', title: t('newGroup'), onClick: () => setDialog({ kind: 'createGroup' }) }, '🗂⁺'),
          h('button', { className: 'row-btn always', title: t('addWorkspace'), onClick: addWorkspace }, ICONS.plus),
        ),
        wide && h('input', {
          className: 'two-search', placeholder: t('search'), value: query,
          onChange: e => setQuery(e.target.value),
        }),
        pendingLoad
          ? h('div', { className: 'empty' }, t('loading'))
          : h('div', { className: 'two-list' }, [
            ...(groups ?? []).map(groupNode),
            (groups ?? []).length > 0 && ungrouped.length > 0
              && h('div', { key: 'sep', className: 'two-sep' }, t('ungrouped')),
            ...ungrouped.map(ws => workspaceRow(ws, 0)),
            (groups ?? []).length === 0 && ungrouped.length === 0
              && h('div', { className: 'empty' }, t('noWorkspaces')),
          ]),
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
              case 'confirmArchiveGroup': void confirmArchiveGroup(dialog.groupId); break;
              case 'confirmDeleteGroup':
                persist((groups ?? []).filter(g => g.id !== dialog.groupId));
                setDialog(undefined);
                break;
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

    /** Action menu; closes on outside mousedown. */
    function MenuOverlay({ items, onClose }) {
      const ref = useRef(null);
      useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
      }, [onClose]);
      return h('div', { className: 'two-menu', ref }, items.map((item, i) =>
        h('button', {
          key: i,
          className: `two-menu-item${item.danger ? ' danger' : ''}`,
          onClick: () => { onClose(); item.action(); },
        }, item.label),
      ));
    }

    /** Modal text/confirm dialog for group operations. */
    function DialogHost({ dialog, busy, close, onConfirm }) {
      const [name, setName] = useState(dialog.current ?? '');
      const isText = dialog.kind === 'createGroup' || dialog.kind === 'renameGroup' || dialog.kind === 'renameWs';
      const labels = {
        createGroup: [t('newGroup'), t('nameGroup')],
        renameGroup: [t('renameGroup'), t('nameGroup')],
        renameWs: [t('renameWorkspace'), t('nameWorkspace')],
        confirmArchiveGroup: [`${t('archiveGroup').replace('…', '')} — ${dialog.name}`, t('dArchiveGroup')(dialog.count)],
        confirmDeleteGroup: [`${t('ungroup')} — ${dialog.name}`, t('dUngroup')],
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
            h('button', { className: 'two-btn', disabled: busy, onClick: close }, t('cancel')),
            h('button', {
              className: `two-btn primary${dialog.kind.startsWith('confirmDelete') ? ' danger' : ''}`,
              disabled: busy || (isText && name.trim() === ''),
              onClick: () => onConfirm({ name }),
            }, busy ? t('working') : t('ok')),
          ),
        ),
      );
    }

    const STYLES = `
.two-browse { display:flex; flex-direction:column; height:100%; min-height:0; font-size:12px; color:inherit; }
.two-header { display:flex; align-items:center; gap:6px; padding:8px 10px 4px; }
.two-title { font-weight:600; opacity:.9; white-space:nowrap; flex:1; }
.two-saving { opacity:.6; }
.two-search { margin:2px 10px 4px; background:transparent; border:1px solid var(--dsh-border, #8885); border-radius:6px; color:inherit; padding:3px 8px; outline:none; }
.two-search:focus { border-color:var(--dsh-accent, #6ea8ff); }
.two-list { flex:1; overflow-y:auto; min-height:0; padding:0 6px 12px; }
.two-sep { margin:10px 8px 4px; font-size:10px; opacity:.55; text-transform:uppercase; letter-spacing:.08em; }
.two-row { display:flex; align-items:center; gap:4px; padding:3px 6px; border-radius:6px; position:relative; }
.two-row:hover { background:var(--dsh-hover, #ffffff14); }
.two-row.session { cursor:pointer; }
.group-row { font-weight:600; }
.group-chev { color:var(--dsh-accent, #6ea8ff); }
.row-dot { width:6px; height:6px; border-radius:50%; background:var(--dsh-dot-idle, #8886); flex:none; }
.row-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.row-title.archived { opacity:.5; text-decoration:line-through; }
.ws-title { cursor:default; }
.count { opacity:.5; font-size:10px; flex:none; }
.chev { background:none; border:none; color:inherit; opacity:.55; cursor:pointer; padding:0 2px; font-size:9px; transition:transform .12s; flex:none; }
.row-btn { background:none; border:none; color:inherit; opacity:0; cursor:pointer; padding:0 3px; font-size:11px; flex:none; }
.row-btn.always { opacity:.75; font-size:12px; }
.two-row:hover .row-btn, .two-row:hover .chev, .two-header .row-btn { opacity:.75; }
.row-btn:hover { opacity:1 !important; }
.empty { opacity:.5; padding:6px 8px; font-size:11px; }
.two-menu { position:fixed; z-index:1000; min-width:190px; max-height:50vh; overflow-y:auto; background:var(--dsh-menu-bg, #22262e); border:1px solid var(--dsh-border, #8884); border-radius:8px; padding:4px; box-shadow:0 8px 24px #0007; }
.two-menu-item { display:block; width:100%; text-align:left; background:none; border:none; color:inherit; padding:6px 10px; border-radius:5px; cursor:pointer; font-size:12px; white-space:nowrap; }
.two-menu-item:hover { background:var(--dsh-hover, #ffffff14); }
.two-menu-item.danger { color:#ff8484; }
.two-dialog-back { position:fixed; inset:0; z-index:1001; background:#0008; display:flex; align-items:center; justify-content:center; }
.two-dialog { background:var(--dsh-menu-bg, #22262e); border:1px solid var(--dsh-border, #8884); border-radius:10px; padding:16px; min-width:320px; max-width:440px; }
.two-dialog-title { font-weight:600; margin-bottom:8px; }
.two-dialog-body { opacity:.8; margin-bottom:12px; }
.two-dialog-input { width:100%; box-sizing:border-box; background:transparent; border:1px solid var(--dsh-border, #8886); border-radius:6px; color:inherit; padding:6px 8px; outline:none; margin-bottom:12px; }
.two-dialog-actions { display:flex; justify-content:flex-end; gap:8px; }
.two-btn { background:var(--dsh-hover, #ffffff10); border:1px solid var(--dsh-border, #8884); color:inherit; border-radius:6px; padding:5px 14px; cursor:pointer; }
.two-btn.primary { background:var(--dsh-accent, #2f6fed); border-color:transparent; color:#fff; }
.two-btn.danger { background:#c0392b; border-color:transparent; color:#fff; }
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
            return h(GroupedBrowser, { ...runtimeProps, services });
          },
        ));
      },
    };
  },
});
