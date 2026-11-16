# Development notes

Facts that cost real time to rediscover, kept out of the source comments because
they describe the harness this plugin plugs into rather than anything in it.

## Shadowing `sidebar.workspaces`

The slot renders the **lowest-priority live entry**, so registering at
`priority: -100` takes the render while the shipped `WorkspaceBrowser` stays
registered at `0`. That is deliberate: its declared child slots survive, so
other plugins keep their seats. It also means the shipped browser **never
mounts** — there is no UI behind this one to fall back to.

Two consequences:

- **A row class this browser hides is unreachable.** Whenever a filter is added
  (archived, pinned, subagent, blank), ship the control that reveals the rows it
  filters, or leave them visible. The archived-row filter exists for exactly this
  reason: hiding archived sessions without a way back made them vanish for good.
- **A crashing entry abdicates silently.** The slot catches the render error and
  retires the entry, which unmounts the error boundary together with its
  `data-slot-error` anchor — so an empty DOM is not evidence that nothing
  crashed. `CrashReporter` in `src/client/index.tsx` logs the real error before
  re-throwing, which is why a failure shows up in the console even though the
  fallback to the shipped browser looks clean.

## Props come in as selector hooks

`useWorkspaces`, `useSessions`, `useSessionStatus` and the rest are **hooks**
synthesized by `observableHook(source)`, not raw stores. Call them with a
selector (`useSessions(snapshot => snapshot)`). Passing one to
`useSyncExternalStore(hook.subscribe, …)` reads `subscribe` off a function and
throws on the first render.

A shadowing entry also does **not** receive the official entry's injected face.
Every business operation resolves its service through `ctx.get` at call time,
and an absent service degrades that one action instead of failing the mount.

## Right-click: `onContextMenu`, never `mousedown`

Other plugins claim `contextmenu` during the document **capture** phase and call
`stopPropagation()`. React's delegated `onContextMenu` then never fires for the
rows they claimed, and their menu is the only one on screen — which is the
arbitration working, not a bug.

Opening on `mousedown`/`pointerdown` steps around that arbitration and stacks two
menus on every right-click. Rows this plugin draws that no other plugin
understands (group rows, the ungrouped bucket) still reach our handler, so the
menu appears exactly where nothing else claimed the gesture.

### Positioning: `anchorPoint`, not an anchor rect

The shipped `Menu` used to take `getAnchorRect` and hang the card off an
arbitrary viewport rectangle. DSH `0.2.2-rc.2` dropped that prop for CSS anchor
positioning: the card is placed against an **anchor box**, either the trigger
element (`anchorRef`) or a zero-size box the menu itself puts at the pointer
(`anchorPoint`). A caller that still passes a rect keeps compiling against
`0.2.2-rc.1` types, but at runtime the prop is ignored and the card hangs off
this entry's own zero-size wrapper — somewhere in the browsing region, nowhere
near the click.

The shape every shell menu uses, and this plugin uses, is therefore:

```tsx
<Menu open portal contextual anchor={null} anchorPoint={{ x, y }} … />
```

`contextual` is what makes the card a context popup (cursor clearance, grouped
icon columns, and swallowing a right-click inside the card). `returnFocus`
resolves the control the card hands the keyboard back to — each row already
carries `tabIndex` for that reason. `tests/browser.spec.tsx` asserts the
coordinates reach the card, so this cannot regress silently; the primitives
double declares its props one by one instead of accepting anything.

## Blank sessions

`SessionSummary.blank` marks a provisional "new session" that keeps its id
forever, whether or not anything was ever sent. A blank row's `displayTitle` is
the directory name, so rendering `workspace.sessionIds` straight gives a row
named after every workspace.

The shipped rule, which this plugin restates in `src/client/select.ts`:

- exactly one blank is visible — the one the main view retains
  (`retainedBy.mainView > 0`); every other blank is a spent draft;
- a blank row shows the localized "New Session" label, not its title;
- a blank row carries no verbs: no timestamp, no action strip, no rename.

## Client and Host reload differently

A Client change (`src/client/`) takes effect on a page reload. A Host change
(`src/index.ts`, `src/host/`) is imported once and needs a DSH restart.

## The bundle's module baseline

A Client bundle runs inside the shell's frozen module table. A `require` outside
the baseline is not a build error — it is a runtime failure that silently falls
back to the shipped browser. `tsdown.config.ts` keeps the baseline out of the
artifact, `scripts/check-client-purity.mjs` refuses an artifact that requests
anything else, and `tests/bundle.spec.ts` checks that the two lists still agree.
