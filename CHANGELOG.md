# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.2.0] - 2026-11-12

### Added

- Copy follows the language selected in DSH through the Client locale service
  instead of the browser language. The dictionaries register with the plugin's
  own fiber, the slot declares its namespace, and a language switch re-renders
  the tree without a reload.
- The folded sidebar renders the shipped rail: two icon controls that ask the
  shell to expand, instead of the whole tree in a 56px column.
- Archiving a Session with running work asks first. The Host's
  `workspace/session-active` refusal is read, the activity families it names are
  listed, and only the confirmation calls the stop-then-archive path. A group
  confirmation names how many of its sessions were running when it opened, and
  only those may be stopped.
- Session rows carry the shipped status fallbacks: the summary's running flag
  while the unified status has no entry, and running subagents. Group roll-ups
  read the same three sources.
- Rows are keyboard reachable (Tab focus, Enter/Space) and every icon-only
  control has an accessible name; touch devices keep the row verbs visible.
- A refused Host save shows a retry control instead of an indicator that never
  settles.
- Archived rows are reachable again. The view menu carries the shipped three-way
  choice — hide archived sessions, show all sessions including archived ones, or
  archived only — and the choice survives a reload. While archived rows are on
  screen they offer "Restore from archive" instead of "Archive session", and they
  do not open, because an archived session cannot be viewed.

### Fixed

- An opened ordinary Session no longer jumps to the first row of its Workspace.
  Only the retained blank placeholder leads; the main view also retains a
  Session that is already a conversation.
- A group-level operation acts on the sessions and workspaces its confirmation
  counted: both lists are frozen when the dialog opens.
- Nothing is written before the stored group document arrives, and an edit made
  during the load no longer replaces the stored groups with a document built
  from an empty list.
- A corrupt or unreadable stored document answers `500` instead of an empty
  document, so the Client keeps its localStorage mirror instead of showing an
  installation with no groups.
- The archived-only view drops Workspaces with no archived row, as the shipped
  browser does.
- Adding a Workspace opens its Session, the way the shipped picker does.
- A Session with no stored title reads as "Untitled" and the automatic first-use
  Workspace reads as the localized default name, instead of a directory name or
  raw id.
- An unchanged title in a rename dialog is saved, so confirming the prefill can
  pin an automatic title, as the shipped dialog allows.
- Spawned subagent sessions no longer take a row of their own. The session
  catalog carries them (`origin: 'subagent'`) and the shipped browser shows them
  under their parent's header; the shadowing tree rendered them as ordinary rows
  with their own archive verb, and a group-level archive would have archived
  them. The rule now lives in `sessionShown`, so the rows, the group content
  counts and the bulk operations cannot disagree about it again.
- A refused restore is reported the way a refused archive is, instead of
  surfacing as an unhandled rejection.
- Group-document writes are queued in edit order. The Host serializes the writes it
  receives by arrival, not by the order the edits were made, so two POSTs racing
  each other could commit an older document last while the tree reported the newer
  one saved. Saves now run one at a time through a client-side chain, and the save
  indicator follows the newest queued write rather than whichever answered last.
- `$DSH_HOME` is resolved the way the rest of the Host resolves it: a blank
  override counts as unset, `~/…` expands against the OS home, and the result is
  absolute. A raw read put this plugin's document under the process cwd (or a
  directory literally named `~`) while every other DSH component kept reading
  `~/.dsh`, where the tree then looked empty.
- An oversized write body is answered `413` and a malformed one `400`. Both used
  to answer `400 invalid json body`, blaming the JSON for the byte cap. The reader
  stops the upload but leaves the socket open, so that answer can actually reach
  the caller; the connection closes once it has gone out. A stream that fails
  while the body is being read is neither: it keeps the ordinary 500 path instead
  of being reported as an oversized body.
- A group name cannot be typed past the document's own cap. The field carries
  `maxLength`, so a name the Host would reject as an invalid document — which
  the Client could only show as a save that never settles — is out of reach.
- "Move out of group" is offered only for a Workspace that is in a group; an
  ungrouped row used to carry an entry that could not change anything.
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

- Requires `0.2.2-rc.1` or newer; the development dependencies, the README and
  `engines.dsh` name the same baseline. The package declares
  `dsh.manifestVersion: 1`.
- The locale dictionaries live in `i18n.ts` and are resolved through the
  framework `t` seat; the component test derives its English copy from the same
  dictionary instead of a second copy.

- Rendering derives the visible rows, the content counts and the move
  destinations once per snapshot rather than once per render site, and member
  lookup is a map instead of a linear scan, so a group tree no longer costs
  group × workspaces per render.
- The render-order rule (retained placeholder first, archived rows last) is one
  helper shared by both listings instead of two copies, and the bucket
  vocabulary is the primitives' own `RelativeTimeUnit` rather than a duplicate
  union. The bucketing itself stays local, and says so: importing the
  primitives' runtime would drag the component library into every derivation.
- The document's limits are named constants (`MAX_ID_LENGTH`,
  `MAX_GROUP_NAME_LENGTH`) shared by the validator, the Client's field cap and
  the tests, instead of 128 and 200 written out at each site.
- Dead surface removed. `detectLocale`, `messagesFor` and the `Locale` type were
  exported for nobody — this bundle renders one locale and publishes `messages`
  — and `readBody`, the byte cap the write route depends on, is now covered
  rather than merely exported.
- `apply`'s group-move action is one implementation shared by every candidate
  destination; it used to rebuild the whole document once per submenu row.
- Tests: the Host's own boundaries (write fence, body cap, home resolution) moved
  to `tests/host.spec.ts` so the contract spec is only the document's
  specification; three near-identical body-cap measurements became one at the
  document's true maximum; one duplicate listing assertion is gone; and the
  browser spec reads the storage keys from the module instead of repeating their
  literals.
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

[Unreleased]: https://github.com/GT-610/dsh-workspace-organize/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/GT-610/dsh-workspace-organize/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GT-610/dsh-workspace-organize/releases/tag/v0.1.0
