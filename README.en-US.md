[中文](README.md)

# dsh-workspace-organize

A DSH plugin that groups sidebar workspaces into named groups and browses them as group → workspace → session. Groups are a virtual layer the plugin owns; grouping itself never rewrites official data.

## Features

- **Three-level browsing.** Group → workspace → session. Row heights, type scale, and icons match the shipped sidebar, as does disclosure behavior; theming and menu appearance track the shell.
- **Groups live on their own.** The group document sits under `$DSH_HOME/storages/`, separate from the official workspace registry. Nothing about a workspace or session changes unless you ask for it.
- **Rows follow the shipped rules.** Only the blank session the main view currently holds is shown, labeled "New session"; subagent sessions sit under their parent; sessions with no workspace go to "Ungrouped" and stay openable.
- **Archive and restore.** Archiving removes the row from the list, and its trailing button becomes "Restore from archive". The view menu switches between hidden, all, and archived-only, and remembers the choice.
- **Running work is protected.** When a session still has a running turn, subagent, job, or reminder, the plugin lists the running work and stops it only after confirmation. A group confirmation acts only on what it counted.
- **Group-level bulk actions.** Archive every session in a group or delete every workspace in it. The archive count covers only sessions that will actually be archived, excluding archived, blank, and subagent sessions; the delete count covers workspaces.
- **Right-click menu.** Rows another plugin has claimed get no menu from this plugin, so two menus never stack.
- **Disclosure choices persist.** Expand/collapse choices stay in localStorage across reloads.

## Install

Requires DSH `>= 0.2.2-rc.1`; building and testing need Node.js `>= 22.19.0`.

Not yet published to npm. Install from GitHub:

```sh
dsh plugin --profile <profile> add github:GT-610/dsh-workspace-organize
```

Alternatively, clone the repository and install the local directory:

```sh
git clone https://github.com/GT-610/dsh-workspace-organize
dsh plugin --profile <profile> add /path/to/dsh-workspace-organize
```

Restart DSH afterwards. `dist/` is committed, so a git install needs no build-script allowlist; a local package can also be installed from Settings → Plugins.

### Local development

```sh
pnpm install
pnpm build       # rebuild dist/ after changing sources
```

Link the checkout into the profile's `node_modules`:

```sh
# macOS / Linux
ln -s "$PWD" ~/.dsh/profiles/<profile>/node_modules/dsh-workspace-organize
```

```powershell
# Windows
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\dsh-workspace-organize" -Target (Get-Location)
```

After that, run `pnpm dev` (`tsdown --watch`) and reload the page after a change.

## Usage

| Goal | Where |
| --- | --- |
| Create a group | Header view-options button → New group |
| Rename / ungroup a group | Right-click or ⋯ on the group row |
| Archive every session in a group | Group row ⋯ → Archive all sessions in group… |
| Delete every workspace in a group | Group row ⋯ → Delete all workspaces in group… |
| Move a workspace into a group | Workspace row ⋯ → Move to group → pick one |
| Move a workspace out of its group | Workspace row ⋯ → Move out of group (only while it is in one) |
| Start a session in a workspace | Workspace row ⋯ or the trailing new-session button |
| Archive / restore one session | Trailing archive button on the session row, or its context menu |
| See archived sessions | Header view-options button → All sessions (show archived) / Only archived sessions |
| Expand / collapse everything | Header view-options button → Expand all / Collapse all |
| Search sessions by title | Header magnifier |

## Data and privacy

- The group document exists in two places: `$DSH_HOME/storages/workspace-organize-groups.json` on the Host and a localStorage mirror in the browser. The mirror takes writes while the Host is unreachable; the Host copy wins once it is back.
- The archive and pin state is official. The plugin only calls the official archive and restore operations.
- Writes use a temporary file plus `rename`, behind a serialized chain. Reads are open (the server listens on loopback only); writes check `Sec-Fetch-Site` / `Origin`, accepting a request with neither header as a non-browser call.
- The document is capped at 200 groups, 500 workspaces per group, and 2,000 members total. Invalid documents are rejected whole, unknown fields dropped, and duplicate members removed. A body over 2 MiB gets `413`; a parse or validation failure gets `400`.

## How it works

```text
sidebar.workspaces slot
  ├─ shipped WorkspaceBrowser   priority 0 (stays registered)
  └─ this plugin                priority -100 (renders)
       ├─ reads official snapshots, calls official operations
       └─ group document ←→ /api/workspace-organize
            └─ $DSH_HOME/storages/workspace-organize-groups.json
```

The shipped entry stays registered, so its child slots survive; this plugin wins the cell at a lower priority and resolves official services lazily through `ctx.get`.

## Development

```text
src/index.ts              Host: route, same-origin fence, atomic storage
src/shared/contract.ts    types and validator used by both halves
src/client/               slot registration, tree and menus, derivations, transport, i18n, styles
tests/                    unit tests and jsdom component tests
```

```sh
pnpm typecheck   # checked against the published DSH types
pnpm lint        # oxlint
pnpm test        # vitest
pnpm build       # tsdown → dist/
pnpm check       # all four of the above
```

- `dist/` is committed and is what DSH loads; CI rebuilds it and fails on any diff.
- Types come from the published packages, so slot-contract drift fails `pnpm typecheck` first.
- The client artifact is a closure factory; CSS is global with a `dwo-` prefix; copy goes through the Client locale service.
- Component tests substitute `tests/stubs/primitives.tsx` for the shipped primitives, whose ESM entry does not declare its runtime imports.

## Compatibility

- Copy follows the DSH language setting; switching languages needs no reload.
- Web half only. The desktop shell and a browser behave the same.
- Coexists with right-click plugins. Shadowing does not render the official session-row seats, so pin, fork, and copy-ID rows do not appear in the grouped tree; the plugin provides its own archive and rename rows.

## License

[MIT](LICENSE)
