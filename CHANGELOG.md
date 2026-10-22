# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Archived rows are reachable again. The view menu carries the shipped three-way
  choice — hide archived sessions, show all sessions including archived ones, or
  archived only — and the choice survives a reload. While archived rows are on
  screen they offer "Restore from archive" instead of "Archive session", and they
  do not open, because an archived session cannot be viewed.

### Fixed

- Archiving a session no longer makes it unreachable. The shadowing browser has
  no shipped browser behind it, so a hidden archived row had no way back; the
  archived branch of the session row (restore verb, archived styling,
  `aria-description`) was therefore dead code that only now runs.
- A group-level archive now acts on exactly the sessions its confirmation
  counted. The count and the operation share one derivation of "a session in
  this group", so a typed search can no longer make the dialog promise three
  rows while the operation archives every session in the group.
- Archived sessions stay out of the group roll-up that labels the group row.
- The Host route is typed again. `src/index.ts` never loaded
  `@deepseek-ai/dsh-host-webserver`, whose module augmentation is what puts
  `webServer` on `Context`, so `ctx.get('webServer')` was `any` and the route
  kind, path and handler signature went unchecked.
- A `HEAD` request no longer carries a body, and the read route answers with
  `cache-control: no-store` — the client asks with `cache: 'no-store'` — so a
  reload cannot render a remembered copy of the group document.
- The document limits agree. Members were capped per group and groups per
  document, which allowed a document the validator accepted but the body cap
  refused; a whole-document member cap makes the structural limits fit, with a
  test that builds a document at them and measures it. The body cap itself is
  now sized in bytes as the route counts them: at 1 MB it was measured in
  characters, so a legal document whose ids were control characters — six bytes
  each as `\uXXXX` — encoded past it and was refused before validation ran.
  It is 2 MiB, above the measured worst case.
- A workspace is placed at most once. A document naming the same workspace in
  two groups, or twice in one, is normalized to the first occurrence instead of
  rendering it under both headings.
- A stored expand/collapse choice no longer outlives its node: deleting a group
  or a workspace used to leave its key in the browser mirror forever.
- Sessions that no Workspace accounts for have a row again. A Workspace owns its
  sessions through its own member list, so a Session whose Workspace
  registration was deleted — or one started with no Workspace at all — is in no
  account. The shipped sidebar trails exactly those rows in its own `Ungrouped`
  bucket (`groupByWorkspace` in ui-workspace's `tree.ts`), and shadowing that
  sidebar removed the bucket with it: such a Session still ran, opened and
  archived, yet the tree had no row for it. The plugin now derives the same
  bucket — newest first with the retained placeholder leading, archived rows
  trailing live ones under the current archive filter, spent drafts out, search
  applied — and renders it below the ungrouped Workspaces. It rests open,
  because a folded bucket would hide the very rows it exists to reveal.

### Changed

- Rendering derives the visible rows, the content counts and the move
  destinations once per snapshot rather than once per render site, and member
  lookup is a map instead of a linear scan, so a group tree no longer costs
  group × workspaces per render.
- The package declares `"icon": "./icon.svg"`, the form every shipped bundle
  uses, and two dev dependencies nothing imported are gone.
- CI checks that the client bundle requests only the shell's baseline modules.
  A request outside it fails at runtime, where the sidebar silently falls back
  to the shipped browser; nothing else in CI read the emitted artifact.
- The READMEs say search matches session titles, not message content.
- The label over ungrouped Workspaces reads "Ungrouped workspaces", and the bare
  "Ungrouped" now names the session bucket below them, as it does in the shipped
  sidebar.

## [0.1.0] - 2026-10-19

First public release.

### Added

- A grouped Workspace browser that shadows the shipped `sidebar.workspaces`
  region and browses group → workspace → session.
- Group document persistence through a plugin-owned Host route
  (`/api/workspace-organize`) with atomic writes, a same-origin write fence and
  a localStorage mirror.
- Group menus for rename, ungroup, archive-all-sessions and
  delete-all-workspaces, plus per-workspace move-in/move-out.
- Session search, expand-all/collapse-all, and disclosure choices that survive a
  reload.
- A menu on `contextmenu` that yields to any other plugin which has already
  claimed the row, so no two menus ever appear at once.

### Changed

- Blank sessions follow the shipped visibility rule: only the provisional
  session the main view retains renders, labeled "New Session", while spent
  drafts and their directory-derived same-name rows stay out of the tree.
- Both halves are TypeScript sources built with tsdown into `dist/`, checked
  against the published DSH contracts.
- The browser uses the shipped primitives (`Menu`, `Modal`, `Tooltip`, `Icon*`,
  `StateDot`) instead of hand-copied artwork and hand-rolled menu and dialog
  surfaces.
- Class names are prefixed `dwo-` because the injected stylesheet is global.
- `dist/` is committed: DSH blocks a package's build scripts by default, so a
  git install that declares `prepare` is rejected outright. The artifacts travel
  with the repository and CI fails if a rebuild differs from them.

[Unreleased]: https://github.com/GT-610/dsh-workspace-organize/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GT-610/dsh-workspace-organize/releases/tag/v0.1.0
