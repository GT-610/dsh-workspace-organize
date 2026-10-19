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
