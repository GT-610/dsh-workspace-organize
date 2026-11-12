/**
 * Plugin-owned stylesheet.
 *
 * Metrics, transitions and variables are the shipped 0.2.2 stylesheet's own
 * (`WorkspaceBrowser.module.css` / `Rows.module.css`), restated under this
 * plugin's `dwo-` prefix because the injected sheet is global. Colour, radius and
 * motion still come from the shell's tokens, so light and dark mode follow the
 * surface this entry shadows. Only selectors the tree actually renders are kept:
 * no drag, search-result or hover-card rules, because this browser does not draw
 * those surfaces.
 */
export const STYLES = `
.dwo-browse { --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding, 0px); --dsh-session-list-scrollbar-width: 5px; --dsh-session-list-scrollbar-offset: 2px; box-sizing:border-box; min-height:0; padding-right:var(--dsh-session-list-edge-inset); flex:1; display:flex; flex-direction:column; color:var(--dsw-alias-label-primary); }
.dwo-browse.rail { padding-right:0; }

.dwo-icon-btn { border-radius:var(--dsw-radius-sm); cursor:pointer; width:28px; height:28px; color:var(--dsw-alias-label-secondary); background:0 0; border:none; flex:none; justify-content:center; align-items:center; padding:0; display:inline-flex; }
.dwo-icon-btn:focus-visible, .dwo-search-btn:focus-visible, .dwo-search-clear:focus-visible { outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:-2px; }
@media (hover:hover) { .dwo-icon-btn:hover { background:var(--dsw-alias-interactive-bg-hover); } }
.dwo-saving { flex:none; opacity:.6; }
.dwo-save-failed { color:var(--dsw-alias-state-warning-primary,#c27c00); font-weight:700; }

.dwo-header { height:36px; padding-left:var(--dsh-sidebar-row-padding,8px); box-sizing:border-box; border-radius:var(--dsw-radius-md); color:var(--dsw-alias-label-tertiary); flex:none; justify-content:flex-end; align-items:center; gap:4px; margin-bottom:4px; display:flex; overflow:hidden; }
.dwo-browse:not(.rail) .dwo-header { margin-top:2px; margin-right:-4px; transition:margin-right .18s var(--ds-ease-in-out), padding-inline .18s var(--ds-ease-in-out), gap .18s var(--ds-ease-in-out); }
.dwo-browse:not(.rail) .dwo-header:not(:has(.dwo-search.open)) { padding-right:1px; }
.dwo-head-label { white-space:nowrap; opacity:1; visibility:visible; min-width:0; max-width:45%; transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear; flex:none; line-height:20px; position:relative; left:-1px; overflow:hidden; }
.dwo-head-label.hidden { opacity:0; visibility:hidden; max-width:0; margin-right:-4px; transition-delay:0s,0s,0s,0s,.18s; transform:translate(-4px); }
.dwo-search-slot { box-sizing:border-box; min-width:0; max-width:28px; transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out); flex:1; align-items:center; margin-left:auto; padding-left:0; display:flex; }
.dwo-search-slot.open { max-width:100%; padding-left:0; }
.dwo-head-actions { opacity:1; visibility:visible; max-width:96px; transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear; flex:none; align-items:center; gap:4px; display:flex; overflow:hidden; }
.dwo-head-actions.hidden { opacity:0; visibility:hidden; pointer-events:none; max-width:0; transition-delay:0s,0s,0s,.18s; transform:translate(4px); }
.dwo-search { box-sizing:border-box; border-radius:var(--dsw-radius-sm); cursor:text; width:100%; height:28px; color:var(--dsw-alias-label-secondary); transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out); background:0 0; border:none; flex:none; align-items:center; gap:0; margin:0; padding:0; display:flex; overflow:hidden; }
.dwo-browse:not(.rail) .dwo-header:has(.dwo-search.open) { padding-inline:calc(var(--dsh-sidebar-paint-inset,0px) + 1px); gap:0; margin-right:0; }
.dwo-header:has(.dwo-search.open) .dwo-head-label.hidden { margin-right:0; }
.dwo-search.open { border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); width:100%; height:32px; color:var(--dsw-alias-label-caption); background:0 0; margin-inline:0; padding:0 4px 0 0; }
.dwo-search-btn { border-radius:var(--dsw-radius-sm); cursor:pointer; width:28px; height:28px; color:inherit; background:0 0; border:none; flex:none; justify-content:center; align-items:center; padding:0; display:inline-flex; }
.dwo-search.open .dwo-search-btn { width:28px; height:32px; }
@media (hover:hover) { .dwo-search-btn:hover { background:var(--dsw-alias-interactive-bg-hover); } .dwo-search.open .dwo-search-btn:hover { background:0 0; } }
.dwo-search-input { opacity:0; pointer-events:none; width:0; min-width:0; color:var(--dsw-alias-label-primary); transition:opacity .12s var(--ds-ease-in-out); background:0 0; border:none; outline:none; flex:1; font-size:13px; line-height:18px; }
.dwo-search.open .dwo-search-input { opacity:1; pointer-events:auto; margin-left:-2px; }
.dwo-search-input::placeholder { color:var(--dsw-alias-label-tertiary); }
.dwo-search-clear { border-radius:var(--dsw-radius-sm); cursor:pointer; width:24px; height:24px; color:var(--dsw-alias-label-secondary); background:0 0; border:none; flex:none; justify-content:center; align-items:center; padding:0; display:inline-flex; }
@media (hover:hover) { .dwo-search-clear:hover { background:var(--dsw-alias-interactive-bg-hover); } }

.dwo-browse.rail .dwo-header { justify-content:flex-start; gap:0; margin-bottom:12px; padding-left:0; }
.dwo-rail-search { flex:none; display:flex; padding-left:0; margin-bottom:12px; }
.dwo-browse.rail .dwo-icon-btn { border-radius:var(--dsw-radius-md); width:36px; height:36px; color:var(--dsw-alias-label-primary); }

.dwo-tree-body { flex-direction:column; flex:1; min-height:0; display:flex; position:relative; animation:dwo-wide-in .2s var(--ds-ease-in-out); }
@keyframes dwo-wide-in { 0% { opacity:0 } }
.dwo-list { min-height:0; margin-left:-4px; margin-right:var(--dsh-session-list-scrollbar-offset,2px); padding-left:4px; padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width,5px) - var(--dsh-session-list-scrollbar-offset,2px)); scrollbar-gutter:stable; flex:1; padding-bottom:16px; overflow-y:auto; }
.dwo-fade { left:0; right:var(--dsh-session-list-edge-inset); background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill)); pointer-events:none; height:24px; position:absolute; bottom:0; }
[data-platform=darwin] .dwo-fade { display:none; }
.dwo-sep { margin:10px 8px 4px; font-size:11px; line-height:15px; color:var(--dsw-alias-label-tertiary); }

.dwo-row { align-items:center; gap:var(--dsh-sidebar-label-gap,6px); border-radius:var(--dsw-radius-md); border-inline:var(--dsh-sidebar-paint-inset,0px) solid transparent; box-sizing:border-box; padding:0 8px; cursor:pointer; user-select:none; color:var(--dsw-alias-label-primary); background-clip:padding-box; padding-inline-start:calc(var(--dsh-sidebar-row-padding,8px) - var(--dsh-sidebar-paint-inset,0px) + var(--dsh-workspace-indent,0px)); display:flex; }
.dwo-row:focus-visible { outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:-2px; }
@media (hover:hover) { .dwo-ws-row:hover, .dwo-group-row:hover, .dwo-session-row:hover { background-color:var(--dsw-alias-interactive-bg-hover); } }
.dwo-row.menu-open, .dwo-session-row[aria-selected="true"] { background-color:var(--dsw-alias-interactive-bg-hover); }
.dwo-ws-row, .dwo-group-row { height:34px; }
.dwo-ws-row .dwo-actions, .dwo-group-row .dwo-actions { height:20px; }
.dwo-session-row { gap:0; height:32px; }
.dwo-group-node + .dwo-group-node { margin-top:4px; }
.dwo-ws-node + .dwo-ws-node { margin-top:2px; }

.dwo-slot { width:16px; height:20px; color:var(--dsw-alias-label-tertiary); flex:none; justify-content:center; align-items:center; display:inline-flex; }
.dwo-folder.active { color:var(--dsw-alias-state-business-primary); }
.dwo-chev { color:var(--dsw-alias-label-caption); }
.dwo-arrow { transition:transform .15s var(--ds-ease-in-out); display:inline-flex; }
.dwo-arrow.open { transform:rotate(90deg); }
@media (hover:hover) {
  .dwo-ws-row .dwo-chev { display:none; }
  .dwo-ws-row:hover .dwo-chev, .dwo-ws-row.menu-open .dwo-chev { display:inline-flex; }
  .dwo-ws-row:hover .dwo-folder, .dwo-ws-row.menu-open .dwo-folder { display:none; }
}

.dwo-text { flex-direction:column; flex:1; gap:2px; min-width:0; display:flex; }
.dwo-row-title { text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:14px; line-height:20px; overflow:hidden; }
.dwo-group-title { font-weight:600; }
.dwo-session-row .dwo-row-title { flex:1; margin:0 6px 0 var(--dsh-sidebar-label-gap,6px); }
@media (hover:hover) { .dwo-session-row:hover .dwo-row-title { text-overflow:clip; } }
.dwo-time { color:var(--dsw-alias-label-tertiary); flex:none; margin-inline-end:-1px; font-size:10px; line-height:16px; }
.dwo-count { flex:none; font-size:10px; line-height:16px; color:var(--dsw-alias-label-tertiary); display:inline-flex; align-items:center; gap:4px; }
.dwo-session-row.archived .dwo-row-title { color:var(--dsw-alias-label-caption); }
.dwo-empty { color:var(--dsw-alias-label-tertiary); padding:16px 12px; font-size:13px; }
.dwo-empty-link { cursor:pointer; color:var(--dsw-alias-link); background:0 0; border:none; padding:0; font-size:13px; line-height:20px; }
.dwo-ws-sessions { display:flex; flex-direction:column; }
.dwo-ws-sessions > * + * { margin-top:2px; }

.dwo-actions { flex:none; align-items:center; gap:13px; display:none; }
.dwo-row.menu-open .dwo-actions { display:inline-flex; }
@media (hover:hover) { .dwo-row:hover .dwo-actions { display:inline-flex; } }
html[data-input-modality=keyboard] .dwo-session-row:focus-within .dwo-actions { display:inline-flex; }
html[data-input-modality=keyboard] .dwo-session-row:focus-within .dwo-time { display:none; }
html[data-input-modality=keyboard] .dwo-ws-row:focus-within .dwo-actions,
html[data-input-modality=keyboard] .dwo-group-row:focus-within .dwo-actions { display:inline-flex; }
html[data-input-modality=keyboard] .dwo-group-row:focus-within .dwo-count { display:none; }
.dwo-act-btn { border-radius:var(--dsw-radius-xs); cursor:pointer; width:24px; height:24px; color:var(--dsw-alias-label-tertiary); background:0 0; border:none; flex:none; justify-content:center; align-items:center; margin:-4px; padding:0; display:inline-flex; }
.dwo-act-btn:focus-visible { outline-offset:-2px; }
@media (hover:hover) { .dwo-act-btn:hover { color:var(--dsw-alias-label-primary); } }
@media (hover:hover) { .dwo-row:hover .dwo-time, .dwo-row.menu-open .dwo-time, .dwo-row:hover .dwo-count, .dwo-row.menu-open .dwo-count { display:none; } }
@media (hover:none) {
  .dwo-actions { display:inline-flex; }
  .dwo-row .dwo-time, .dwo-row .dwo-count { display:none; }
  .dwo-ws-row[aria-expanded="false"] .dwo-actions, .dwo-group-row[aria-expanded="false"] .dwo-actions { display:none; }
}

.dwo-activity { color:var(--dsw-alias-label-primary); margin:0 0 8px; padding-left:18px; font-size:13px; line-height:20px; }
.dwo-activity li { overflow-wrap:anywhere; }
.dwo-dialog-error { color:var(--dsw-alias-state-error-primary); margin-top:8px; font-size:12px; line-height:18px; }

@media (pointer:coarse) { .dwo-search-input { font-size:16px; } }
@media (prefers-reduced-motion:reduce) {
  .dwo-tree-body { animation:none; }
  .dwo-header, .dwo-head-label, .dwo-search-slot, .dwo-search, .dwo-search-input, .dwo-head-actions, .dwo-arrow { transition:none; }
}
`
