# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `dist/` is committed: DSH does not run a package's build scripts on install
  unless they are approved.

[Unreleased]: https://github.com/GT-610/dsh-workspace-organize/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GT-610/dsh-workspace-organize/releases/tag/v0.1.0
