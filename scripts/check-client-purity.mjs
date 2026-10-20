/**
 * Pure-failure guard for the client bundle.
 *
 * A client bundle runs inside the shell's frozen module table, which seeds only
 * the baseline modules. A `require` of anything else is not a build error: the
 * bundler either inlines the dependency (bloating the artifact and duplicating a
 * copy of a package the shell already owns) or leaves the request in place,
 * where it fails at runtime with a module the table cannot resolve — and the
 * sidebar silently falls back to the shipped browser.
 *
 * Nothing else in CI would notice, because `tsc`, `oxlint` and the tests all run
 * against sources rather than the emitted artifact. This script reads the
 * artifact and refuses a request outside the baseline.
 *
 * Usage: `node scripts/check-client-purity.mjs [bundle]`
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * `PLATFORM_MODULES` from the web shell (`@deepseek-ai/dsh-client-web`), in the
 * same order. Keep this list identical to `tsdown.config.ts`, which is what
 * keeps these packages out of the bundle in the first place.
 */
const BASELINE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const bundle = resolve(process.argv[2] ?? 'dist/client.cjs')
const source = await readFile(bundle, 'utf8')

/** Every module specifier the emitted factory asks the module table for. */
const requested = new Set(
  [...source.matchAll(/require\(\s*"([^"]+)"\s*\)/g)].map(match => match[1]),
)

const unknown = [...requested].filter(specifier => !BASELINE.includes(specifier)).toSorted()

if (unknown.length > 0) {
  console.error(
    `client bundle requests ${unknown.length} module(s) outside the baseline:\n`
    + unknown.map(specifier => `  - ${specifier}`).join('\n')
    + '\n\nEither import the package as `import type` only, or add it to both'
    + ' PLATFORM_MODULES in tsdown.config.ts and BASELINE here (which requires'
    + ' the shell to seed it).',
  )
  process.exit(1)
}

console.log(`client bundle is pure: ${[...requested].toSorted().join(', ')}`)
