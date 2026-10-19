---
id: 20261019-065140-dsh-client-slot-entries-two-traps-that-c
scope: project
path: 
saved_at: 2026-10-19T06:51:40.967Z
tags: dsh-plugin, slots, debugging, client-plugin, gotcha
---

# DSH client slot entries: two traps that cost hours

When shadowing a DSH client slot (e.g. registering `sidebar.workspaces` at `priority: -100` to replace the shipped WorkspaceBrowser), two facts matter and are both non-obvious:

1. **Standard-kit props are selector HOOKS, not observable sources.** A root entry receives `useWorkspaces` / `useSessions` / `useSessionStatus` etc., synthesized by `observableHook(source)` in `packages/client/ui-renderer/src/client/bindings.tsx`. Call them directly with a selector: `const list = useSessions(s => s)`. Passing one to `React.useSyncExternalStore(hook.subscribe, ...)` reads `subscribe` off a function, throws on first render, and kills the entry.

2. **A crashing entry abdicates SILENTLY and leaves no trace in the DOM.** `SlotErrorBoundary` (`scoped-slots.tsx`) catches the render error and `reportEntryError(..., {abdicate:true})` retires the entry; the slot then elects the next survivor (the shipped browser). Because abdication unmounts the crashing boundary *together with its `<Anchor data-slot-error>`*, the `data-slot-error` anchor does NOT persist — so "no error anchor in the DOM" does NOT mean "no crash". It just means an earlier-priority entry crashed and lost.

Debug recipe that settles it in one step: temporarily replace the registered component with a trivial `h('div', {className:'X'}, 'PROBE')` and reload. Probe visible => election works and the bug is inside your component; probe absent => registration/lifecycle problem. Also flip a `window.__probeHits__` counter and dump `Object.keys(runtimeProps)` to get the exact injected prop list.

Mitigation worth keeping: wrap your component in an own error boundary whose `componentDidCatch` logs the real error, then re-throws in `render` — you keep the graceful fallback to the shipped UI but the failure becomes loud.

Verified against DSH checkout at `C:\Users\Admin\AppData\Roaming\dsh-tauri\dependencies\dsh` (ui-slots `entriesOfSlot` picks the first non-abdicated entry per cell in ascending priority; lower priority wins).
