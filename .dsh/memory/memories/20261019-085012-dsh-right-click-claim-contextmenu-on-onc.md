---
id: 20261019-085012-dsh-right-click-claim-contextmenu-on-onc
scope: project
path: 
saved_at: 2026-10-19T08:50:12.461Z
tags: dsh-plugin, client-plugin, contextmenu, gotcha, design-tokens
---

# DSH right-click: claim contextmenu on onContextMenu, never m

**Correction of an earlier note in this file (it recommended mousedown — that was wrong and caused two menus at once).**

**Verified arbitration rule.** In the tauri profile other plugins claim `contextmenu` during the document **capture** phase and call `stopPropagation()`, so React's delegated `onContextMenu` never fires *for the rows they claim*. That is deliberate arbitration, not a blanket swallow:

- `.two-head-label` (not a tree row) → reaches the row, React runs.
- Our blank "新会话" placeholder row (`role=treeitem`, `aria-selected=true`) → reaches the row, React runs.
- A **real** session row (`aria-selected=false`) → claimed; the third-party `dsh-tauri-rightclick` session menu renders (重命名会话/归档会话/在资源管理器中打开/复制工作目录/创建会话分支/刷新). Selector it matches on: `[role="treeitem"]` (its dist: `f='[role="treeitem"]'`); the shell's own claim also covers `[role="treeitem"][aria-expanded]`, i.e. workspace rows.
- Workspace row → claimed (shell menu).

**So:** open your menu from `onContextMenu` (`e.preventDefault()` + show). A claimed row never reaches you and the claimer's menu is the only one on screen — no overlap. An unclaimed row (plain web install, no claimer plugin, or a node no plugin understands such as our group rows) reaches you and yours shows. **Never open on `mousedown`/`pointerdown`:** it steps around arbitration and stacks two menus on every right-click (commit 8d07ece → reverted in b2d1ade).

**How to tell who won, and the trap in measuring it.** A document-level `preventDefault()` makes `dispatchEvent()` return `false` and `event.defaultPrevented === true` for *any* target, so neither proves your handler ran. Attach a plain bubble listener **on the row** and dispatch: `reached === 0` means a capture claimer took it; `reached === 1` means the event reached React. React's own handler can also be read off the node at `element['__reactProps$…'].onContextMenu`.

**Render-vs-delivery:** to check your overlay itself, click your own ⋯ button (a plain click never goes through the capture claimers) — that is how the 5-item workspace menu was confirmed to paint.

`@deepseek-ai/dsh-client-ui-primitives` **IS requirable from a client factory** — corrected 2026-10-19 after a runtime check. It is not a dynamic plugin row, but it does not need to be: it is one of the shell-seeded `PLATFORM_MODULES` (`packages/client/web/src/platform.ts`), so it is a **baseline external** and `require()` returned its 288 real exports on the live page (verified through `__dshSidebarModuleSystem__.seed.get('@deepseek-ai/dsh-client-ui-primitives')` and by requiring it inside our own factory). Available: `Button`, `Checkbox`, `HoverCard`/`HoverCardGroup`, `Menu`, `MenuGroup`, `MenuItemButton`, `MenuSurface`, `Modal` (+ `useModalLayer`, `closeTopModal`, `isBehindModal`), `Tooltip`, `DisclosureRow`, and every `Icon*Outline{Regular,Medium}`. **An earlier note in this file claimed it throws — that was an inference from the dynamic boot manifest and it is false.** Do not hand-copy SVG path data or hand-roll a menu/modal: baseline externals must also NOT be repeated in `dsh.client.external`, and the AGENTS.md rule is that menus use `Menu`/`MenuSurface` to keep the shared transparency and blur. Keep using the real theme tokens (`--dsw-alias-*`, `--dsw-radius-*`, `--dsh-sidebar-inline-padding`, `--dsw-menu-surface-fill`, `--dsw-elevation-prominent`); the token definitions live in `packages/client/ui-theme/src/styles/`.
