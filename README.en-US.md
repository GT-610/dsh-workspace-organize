# Workspace Organize

Group the DSH sidebar's workspaces into named groups and browse them as group → workspace → session. Groups are a virtual layer the plugin owns: workspace records, sessions, and the archive/pin sets are never rewritten by it.

[简体中文](README.md)

## Highlights

- **Three-level browsing.** Group → workspace → session. Row heights, type scale, artwork and collapse behavior follow the shipped sidebar: the same `--dsw-*` design tokens and the same shipped components (`Menu`, `Modal`, `Tooltip`, `Icon*`, `StateDot`), so theming and the shared menu blur/transparency keep tracking the shell instead of being maintained here.
- **Groups are a separate virtual layer.** The group document lives on the plugin's own Host route under `$DSH_HOME/storages/` and never touches the official workspace registry. Nothing about a workspace or session changes unless you ask for it.
- **Blank sessions follow the shipped rule.** Every "new session" click leaves a provisional blank session behind. The shipped sidebar renders only the one the main view currently holds, labeled "New Session"; this plugin applies the same rule, so spent drafts no longer pile up as rows named after each workspace.
- **Archive a session, and get it back.** Archiving moves the row out of the list exactly as the shipped browser does; the view menu carries the same three choices — hide archived, show all (including archived), archived only — and the chosen one is remembered. While archived rows are on screen their trailing button becomes "Restore from archive", and the row itself does not open, because an archived session cannot be viewed.
- **Group-level bulk operations.** One group menu entry archives every session in the group, another deletes every workspace in it — both behind a confirmation that names the affected count. The count is the number the operation acts on: archived sessions and the blank placeholder are excluded, so it cannot promise three rows and archive ten.
- **Right-click composes instead of competing.** Menus are claimed on `contextmenu`: if another right-click plugin has already claimed the row, the event is stopped during capture, no second menu appears, and the gesture is never opened on mousedown to step around that arbitration.
- **Disclosure choices persist.** Explicit expand/collapse choices are stored in localStorage, so a reload renders the same tree.

## How it works

```text
┌─ DSH web shell ───────────────────────────────────────────────┐
│                                                              │
│  sidebar.workspaces slot (single cell: lowest priority wins)  │
│    ├─ shipped WorkspaceBrowser   priority 0   (stays registered)
│    └─ this plugin                priority -100(renders)       │
│                                                              │
│  GroupedBrowser                                              │
│    ├─ reads official snapshots: useWorkspaces / useSessions / useSessionStatus
│    ├─ writes official state:    ctx.get('uiWorkspace' | 'workspaces' | 'sessions')
│    └─ group document ←→ /api/workspace-organize (Host route)  │
└──────────────────────────────────────────────────────────────┘

Host half (src/index.ts)
  GET  /api/workspace-organize   → read the group document (loopback-trusted)
  POST /api/workspace-organize   → same-origin write, atomic commit
        └─ $DSH_HOME/storages/workspace-organize-groups.json
```

The shipped entry stays registered in the same slot (at priority 0), so the child slots it declares survive; this plugin wins the cell with a lower priority. That is also why the component receives only the owner share and the framework's standard hooks: a shadowing entry is NOT handed the shipped entry's injected action face, so every business operation resolves an official service lazily through `ctx.get`.

## Install

### From npm / GitHub

```sh
dsh plugin --profile <profile> add dsh-workspace-organize
# or straight from the repository:
dsh plugin --profile <profile> add github:GT-610/dsh-workspace-organize
```

Restart DSH afterwards so the Host re-scans its plugin table. `dist/` is committed, so a git install needs no build-script allowlist (DSH blocks a package's build scripts by default, and rejects a git install that declares `prepare`).

### Local development

```sh
git clone https://github.com/GT-610/dsh-workspace-organize
cd dsh-workspace-organize
pnpm install          # dev dependencies; dist/ is committed, so a link works as-is
pnpm build            # rebuild dist/ after changing sources
```

Then link the checkout into the profile's `node_modules` and restart DSH:

```powershell
# Windows
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\dsh-workspace-organize" -Target (Get-Location)
```

```sh
# macOS / Linux
ln -s "$PWD" ~/.dsh/profiles/<profile>/node_modules/dsh-workspace-organize
```

After that, `pnpm dev` (`tsdown --watch`) plus a page reload is the whole loop.

## Usage

| Goal | Where |
| --- | --- |
| Create a group | Header slider button → New group |
| Rename / ungroup a group | Right-click or ⋯ on the group row |
| Archive every session in a group | Group row ⋯ → Archive all sessions in group… |
| Delete every workspace in a group | Group row ⋯ → Delete all workspaces in group… |
| Move a workspace into a group | Workspace row ⋯ → Move to group → pick one |
| Move a workspace out of its group | Workspace row ⋯ → Move out of group |
| Start a session in a workspace | Workspace row ⋯ or the trailing ＋ |
| Archive / restore one session | Trailing archive button on the session row, or its context menu |
| See archived sessions | Header slider button → All sessions (show archived) / Only archived sessions |
| Expand / collapse everything | Header slider button → Expand all / Collapse all |
| Search sessions by title | Header magnifier |

## Data and privacy

- The group document exists in exactly two places: `$DSH_HOME/storages/workspace-organize-groups.json` on the Host, and a localStorage mirror used when the Host is unreachable (the Host copy stays authoritative).
- The archive and pin sets are not the plugin's: archiving and restoring go through the official operations, so they change the same state the shipped browser reads.
- Writes are atomic — temporary file plus `rename`, behind a serialized write chain so concurrent requests cannot overwrite each other.
- Reads are open (the server itself listens on loopback only). Writes accept same-origin browser requests only: `Sec-Fetch-Site` first, then an `Origin`/`Host` comparison, and a request carrying neither is refused. Reads answer `cache-control: no-store` and the client asks with `cache: 'no-store'`, so a reload always shows the current groups.
- The document is bounded and validated by one shared validator on both sides: at most 200 groups, 500 workspaces per group, 2 000 members in the whole document, and a 1 MiB request body. The structural caps are chosen so any document they accept also fits the body cap. An invalid document is rejected whole rather than partially applied, and unknown fields are dropped so a document written by a later version still loads. A workspace is placed at most once — a repeated member is dropped rather than failing the whole document.

## Development

```text
src/
├─ index.ts                Host half: route, same-origin fence, atomic storage
├─ shared/contract.ts      group-document types and validator used by both halves
└─ client/
   ├─ index.tsx            apply(), official services, crash boundary, registration
   ├─ contract.ts          client-side contract (Services / injected face)
   ├─ Browser.tsx          the three-level tree, rows, menus, dialogs
   ├─ select.ts            pure derivations: visible-row rule, roll-up, time buckets
   ├─ groups.ts            group-document transport and localStorage mirror
   ├─ i18n.ts              Chinese and English copy
   └─ styles.ts            row layout stylesheet (tokens only)
tests/
├─ select.spec.ts          pure derivations (blank rule, roll-up, time buckets)
├─ contract.spec.ts        document validator and same-origin fence
├─ browser.spec.tsx        mounts the component in jsdom, checks rows and menus
└─ stubs/primitives.tsx    double for the shipped primitives (why: below)
```

```sh
pnpm typecheck   # tsc --noEmit, checked against the published DSH types
pnpm lint        # oxlint
pnpm test        # vitest (jsdom)
pnpm build       # tsdown → dist/
pnpm check       # all four of the above
pnpm dev         # tsdown --watch
```

Conventions worth reading before a change:

- **Types come from the packages DSH publishes.** `@deepseek-ai/dsh-client-ui-workspace`, `-ui-slots`, `-ui-session`, `-ui-sidebar`, `-ui-layout`, `-ui-renderer` and the `@deepseek-ai/dsh-api-*` packages are installed as devDependencies for types and tests only. If the slot contract (`PropsRuntime<'sidebar.workspaces'>`) drifts, `pnpm typecheck` fails before the sidebar can.
- **`dist/` is committed.** DSH blocks a package's build scripts by default — a git install declaring `prepare` is rejected outright unless the profile's `pnpm-workspace.yaml` allows it — so the artifacts ship with the repository and `dist/` is what an install actually loads. CI rebuilds them and fails on any diff, so they cannot drift from the sources.
- **The client artifact must be a closure factory.** The shell loads `exports["./client"]` as a script and expects it to call `window.__ModuleLoader__.load({ id, factory })`. `tsdown.config.ts` closes the CommonJS chunk inside that factory with banner/footer, keeping the baseline modules (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`, …) external.
- **Component tests use a double for the shipped primitives.** Their published ESM entry does not declare the runtime it actually imports (`clsx`, `mdast-*`, `micromark-*`, the shiki grammar catalog), so only the copy the shell seeds into its module table can load it. The jsdom tests therefore substitute `tests/stubs/primitives.tsx`, which keeps the contract this plugin depends on; the appearance itself is the shell's business.
- **The stylesheet is global.** Plugin CSS is injected into the page rather than a shadow root, so every class name is prefixed `dwo-`.

## Compatibility

- Requires DSH `>= 0.2.1-rc.2` (the `engines.dsh` field, checked at install time).
- Web half only: the desktop shell renders the same web client, so a tauri and a browser install behave identically.
- Coexists with right-click menu plugins: this plugin never fights for a row someone else has claimed, and does not stop working when such a plugin is absent.

## License

[MIT](LICENSE)
