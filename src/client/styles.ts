/**
 * Plugin-owned stylesheet.
 *
 * Every value is a `--dsw-*` design token, so the browser follows the shipped
 * theme in both light and dark mode exactly like the surface it replaces. Class
 * names are prefixed `dwo-` (dsh-workspace-organize) because this sheet is global:
 * the web shell injects plugin CSS into the page, not into a shadow root.
 */
export const STYLES = `
.dwo-browse { --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding, 0px); --dwo-scrollbar-w: 5px; --dwo-scrollbar-off: 2px; flex:1; min-height:0; display:flex; flex-direction:column; box-sizing:border-box; padding-right:var(--dsh-session-list-edge-inset); color:var(--dsw-alias-label-primary); }
.dwo-browse.rail { padding-right:0; }

.dwo-header { flex:none; display:flex; align-items:center; justify-content:flex-end; gap:4px; height:36px; padding-left:4px; margin-bottom:4px; box-sizing:border-box; border-radius:var(--dsw-radius-md,12px); overflow:hidden; color:var(--dsw-alias-label-tertiary); }
.dwo-browse:not(.rail) .dwo-header { margin-top:2px; margin-right:-4px; }
.dwo-head-label { flex:none; max-width:45%; min-width:0; overflow:hidden; white-space:nowrap; line-height:20px; transition:max-width 180ms var(--ds-ease-in-out,ease), opacity 120ms var(--ds-ease-in-out,ease); }
.dwo-head-label.hidden { max-width:0; opacity:0; }
.dwo-saving { flex:none; opacity:.6; }
.dwo-icon-btn { flex:none; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:none; border-radius:var(--dsw-radius-sm,8px); padding:0; background:transparent; cursor:pointer; color:var(--dsw-alias-label-secondary); }
.dwo-icon-btn:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dwo-search-slot { flex:1; max-width:28px; min-width:0; display:flex; align-items:center; margin-left:auto; box-sizing:border-box; transition:max-width 180ms var(--ds-ease-in-out,ease); }
.dwo-search-slot.open { max-width:100%; }
.dwo-search { flex:none; display:flex; align-items:center; width:100%; height:28px; box-sizing:border-box; border:none; border-radius:var(--dsw-radius-sm,8px); background:transparent; color:var(--dsw-alias-label-secondary); overflow:hidden; }
.dwo-search.open { height:30px; padding:0 4px 0 0; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md,12px); }
.dwo-search-input { flex:1; width:0; min-width:0; border:none; outline:none; background:transparent; font-size:13px; line-height:18px; color:var(--dsw-alias-label-primary); }
.dwo-search-input::placeholder { color:var(--dsw-alias-label-tertiary); }
.dwo-head-actions { flex:none; display:flex; align-items:center; gap:4px; max-width:60px; overflow:hidden; transition:max-width 180ms var(--ds-ease-in-out,ease), opacity 120ms var(--ds-ease-in-out,ease); }
.dwo-head-actions.hidden { max-width:0; opacity:0; pointer-events:none; }
.dwo-browse.rail .dwo-header { gap:0; padding-left:0; margin-bottom:12px; justify-content:flex-start; }
.dwo-browse.rail .dwo-icon-btn { width:36px; height:36px; border-radius:var(--dsw-radius-md,12px); color:var(--dsw-alias-label-primary); }
.dwo-browse.rail .dwo-head-label { display:none; }
.dwo-browse.rail .dwo-head-actions { max-width:none; }
.dwo-browse.rail .dwo-search-slot { max-width:36px; }
.dwo-browse.rail .dwo-search, .dwo-browse.rail .dwo-search-btn { width:36px; height:36px; border-radius:var(--dsw-radius-md,12px); }

.dwo-list { flex:1; min-height:0; overflow-y:auto; margin-left:-4px; margin-right:var(--dwo-scrollbar-off); padding-left:4px; padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dwo-scrollbar-w) - var(--dwo-scrollbar-off)); padding-bottom:16px; scrollbar-gutter:stable; }
.dwo-browse.rail .dwo-list { margin-left:0; margin-right:0; padding-left:0; padding-right:0; }
.dwo-sep { margin:10px 8px 4px; font-size:11px; line-height:15px; color:var(--dsw-alias-label-tertiary); }

.dwo-row { display:flex; align-items:center; gap:6px; box-sizing:border-box; border-radius:var(--dsw-radius-md,12px); padding:0 8px; padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px)); cursor:pointer; user-select:none; color:var(--dsw-alias-label-primary); }
.dwo-row:hover, .dwo-row.menu-open { background:var(--dsw-alias-interactive-bg-hover); }
.dwo-ws-row, .dwo-group-row { height:34px; }
.dwo-session-row { height:32px; gap:0; }
.dwo-group-node + .dwo-group-node, .dwo-ws-node + .dwo-ws-node { margin-top:2px; }
.dwo-group-node { margin-bottom:4px; }

.dwo-slot { flex:none; width:16px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-tertiary); }
.dwo-folder.active { color:var(--dsw-alias-state-business-primary); }
.dwo-chev { color:var(--dsw-alias-label-caption); }
.dwo-arrow { display:inline-flex; transition:transform 150ms var(--ds-ease-in-out,ease); }
.dwo-arrow.open { transform:rotate(90deg); }
.dwo-ws-row .dwo-chev { display:none; }
.dwo-ws-row:hover .dwo-chev, .dwo-ws-row.menu-open .dwo-chev { display:inline-flex; }
.dwo-ws-row:hover .dwo-folder, .dwo-ws-row.menu-open .dwo-folder { display:none; }

.dwo-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.dwo-row-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; line-height:20px; }
.dwo-group-title { font-weight:600; }
.dwo-session-row .dwo-row-title { flex:1; margin:0 6px 0 4px; }
.dwo-count, .dwo-time { flex:none; font-size:10px; line-height:16px; color:var(--dsw-alias-label-tertiary); }
.dwo-count { display:inline-flex; align-items:center; gap:4px; }
.dwo-session-row.archived .dwo-row-title { color:var(--dsw-alias-label-caption); }
.dwo-empty { padding:16px 12px; font-size:13px; line-height:20px; color:var(--dsw-alias-label-tertiary); }
.dwo-ws-sessions { display:flex; flex-direction:column; }
.dwo-ws-sessions > * + * { margin-top:2px; }

.dwo-actions { flex:none; display:none; align-items:center; gap:15px; }
.dwo-row:hover .dwo-actions, .dwo-row.menu-open .dwo-actions { display:inline-flex; }
.dwo-act-btn { flex:none; display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border:none; border-radius:var(--dsw-radius-xs,4px); padding:0; background:transparent; cursor:pointer; color:var(--dsw-alias-label-tertiary); }
.dwo-act-btn:hover { color:var(--dsw-alias-label-primary); }
.dwo-row:hover .dwo-time, .dwo-row.menu-open .dwo-time, .dwo-row:hover .dwo-count, .dwo-row.menu-open .dwo-count { display:none; }


`


