---
id: 20261019-085114-blank-sessions-the-same-name-row-per-wor
scope: project
path: 
saved_at: 2026-10-19T08:51:14.771Z
tags: dsh-plugin, sessions, ui-workspace, blank, gotcha, sidebar
---

# Blank Sessions: the same-name row per workspace

**`SessionSummary.blank` is a first-class field, and it is the trap behind "every workspace has a session named after itself".**

Every "new session" click (`uiWorkspace.startSession` → `connectBlank` → `replaceMain`, which retains it as `retainedBy.mainView`) creates a provisional **blank** Session that keeps its id in the Session list forever, whether or not anything was ever sent. A blank row's `displayTitle` is the **directory / Workspace name**, so rendering `workspace.sessionIds` straight gives a row named after each Workspace — this is what the sidebar looked like before commit 3bf6fef.

**Shipped semantics** (`packages/client/ui-workspace/src/client/tree.ts`):

- `sessionVisible()`: `if (session.blank && session.id !== current) return false`, where `current = mainSessionId(list)` = the row with `(retainedBy.mainView ?? 0) > 0`. **Exactly one blank is ever visible** — the one the main view holds.
- `sessionTitle()` returns `''` for a blank; the renderer localizes it as `t('session.new')` (zh `新会话`), see `rows/Rows.tsx` `rowTitle`.
- `sectionMembers()` leads placeholders ahead of pinned and ordinary rows, so the placeholder is the Workspace's first session row.
- Blank rows get **no verbs at all**: no hover time, no row-actions strip (⋮), no drag, no double-click rename (`Rows.tsx` gates each on `!row.blank`).
- Blanks never match search (`deriveSearchResults` skips `summary.blank`), because matching the directory-derived title would tie search to one language.
- Bulk operations should count/act on `contentSessions` (visible minus blanks), not raw `sessionIds`.

**Runtime proof recipe:** temporarily expose the standard-kit list from the client bundle (`window.__twoProbe = { list, wsSnapshot, statuses, archived }` inside the entry component), reload, then read `list.byId[id].blank` and `.retainedBy.mainView`. On 2026-10-19 the profile held ~20 blanks, 19 of them spent; `dsh-pentest` had 7 sessions and **all seven were blanks**, i.e. it renders as an empty Workspace.

**Bonus fact:** with `dsh-tauri-rightclick` installed, a right-click on the blank placeholder (`aria-selected=true`) is *not* claimed — it reaches React, while a real session row *is* claimed and shows the plugin's session menu. So giving the placeholder no menu costs nothing and matches the shipped browser.
