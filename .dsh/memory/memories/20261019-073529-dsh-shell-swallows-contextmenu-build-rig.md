---
id: 20261019-073529-dsh-shell-swallows-contextmenu-build-rig
scope: project
path: 
saved_at: 2026-10-19T07:35:29.197Z
tags: dsh-plugin, client-plugin, contextmenu, gotcha, design-tokens
---

# DSH shell swallows contextmenu; build right-click menus on m

**The DSH desktop shell swallows `contextmenu` in the document capture phase.** A native `document`-level capture listener calls `stopPropagation()`, so the event never reaches React's delegated root listener and `onContextMenu` never fires for most elements. Verified by walking the ancestor chain with capture+bubble listeners and dispatching synthetic events at a sidebar row:

- `contextmenu` → log shows only `<document>:capture`; propagation stops dead.
- `mousedown`, `pointerdown`, `mouseup`, `auxclick` → all reach the row normally.

**Consequence:** a plugin's custom right-click menu must not rely on `onContextMenu`. Catch the gesture on right-button `mousedown` (`e.button === 2`, then `preventDefault()` + `stopPropagation()`), and keep `onContextMenu: e => e.preventDefault()` mounted only to suppress a native menu in environments that do not swallow it. Calling `e.stopPropagation()` matters twice over: it keeps the opening gesture from reaching a document-level "outside click closes the menu" listener, which would otherwise close the menu in the same tick it opened.

**Debugging note:** a trap here is that a stale/absent menu looks like a broken handler. Since a `preventDefault()` on document makes `dispatchEvent()` return `false` for *any* target, that return value cannot prove your handler ran. Instrument with a counter, or read the handler straight off the DOM node — React 18 exposes it on `element['__reactProps$…'].onContextMenu`. Absence of the handler there is the only reliable signal that React never dispatched to it.

`@deepseek-ai/dsh-client-ui-primitives` (icons, Button, Menu, Modal, Tooltip) is a devDependency bundled into the ui-workspace client bundle: it declares no `dsh.client` and exports no `./client`, so it is absent from the boot manifest and `require('@deepseek-ai/dsh-client-ui-primitives')` throws. To match the shipped look, copy its SVG path data and use the real theme tokens (`--dsw-alias-*`, `--dsw-radius-*`, `--dsh-sidebar-inline-padding`, `--dsw-menu-surface-fill`, `--dsw-elevation-prominent`); the token definitions live in `packages/client/ui-theme/src/styles/`.
