---
id: 20261019-174202-shadowing-sidebar-workspaces-removes-the
scope: project
path: src/client
saved_at: 2026-10-20T01:29:24.303Z
tags: dsh-plugin, slots, sidebar, archived, gotcha, reload, client-plugin
---

# Shadowing sidebar.workspaces removes the official UI's escap

# Shadowing `sidebar.workspaces` removes the official browser's escape hatches

**Any row class a shadowing entry hides is unreachable, because the shipped browser is not rendered behind it.** A single `sidebar.workspaces` slot renders only the lowest-priority live entry (this plugin registers at `priority: -100`), so the official `WorkspaceBrowser` stays *registered* — its child slots survive — but never mounts. There is no "fall back to the official UI" path for the operator.

The concrete bug this caused (fixed on branch `fix/archive-flow`): `sessionShown` hard-coded `archived.has(id)` into its visibility test, so archived sessions were filtered out before the renderer. That looked harmless — until you notice the **entire archived branch of the session row was dead code**: the restore verb, the `.archived` title colour, and the `aria-description` that the shipped row hangs on an archived row (`t('toast.archivedNotOpenable')`). Archiving a session therefore made it vanish with no way back.

**Rule of thumb:** whenever a shadowing entry filters rows (archived, pinned, subagent, format-status), it must also ship the control that reveals them — the shipped browser offers an `ArchivedFilter` of `default | show | only` precisely for this. Port the filter alongside the filter rule, or leave the rows visible.

**Shipped ordering facts worth copying when you do:**

- `sessionVisible()` applies the archive filter *last*, so the retained blank placeholder survives `default` and `show` but drops out of `only`.
- `visibleSessionIds` = placeholder first, then live rows, then archived rows (where `reconcileManualOrder` parks them).
- Group roll-ups and group-level bulk actions must exclude archived rows even while the filter displays them, or the confirmation count and the operation disagrees.

## Client vs Host reload asymmetry (cost me a wrong "verified" call)

The **client** half is served live: the Host reads `dist/client.cjs` off disk per request (via the `/plugins/??…` alias), so a rebuild is visible to a page refresh without restarting DSH. The **host** half (`dist/index.js`) is imported once into the Cordis process, so any change to `src/index.ts` needs a DSH **restart** and is otherwise invisible on the live route.

Practical check: `Invoke-WebRequest -Method Head` on `/api/workspace-organize` — if a newly added response header (e.g. `cache-control`) is missing, the running process is still on the old host bundle even though the on-disk `dist/index.js` has it.

**Verifying a client bundle outside the shell** (useful when CDP is unavailable — and note an Edge on port 9222 may be the ordinary browser, with no `/json` endpoints answering): the bundle only calls `window.__ModuleLoader__.load({ id, factory })` and requires three baseline modules (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`). Supply that global plus a `require` shim (jsdom + a primitives stand-in, since the published primitives ESM entry needs the shell's seeded copy), then assert `factory(require)` returns a definition with `apply` and `inject: ['slots']`. Note `<profile>/node_modules/<pkg>` is a symlink to the repo, so a local install always resolves `dist/` at its current bytes — `Get-FileHash` on both sides is a cheap proof.
