// @vitest-environment node
/**
 * The client bundle's module baseline is spelled twice: once in
 * `tsdown.config.ts`, which keeps those packages out of the artifact, and once
 * in `scripts/check-client-purity.mjs`, which refuses an artifact that requests
 * anything else. Only a comment ties the two together, and a drift would let the
 * check pass a bundle the shell's module table cannot load — the failure mode
 * that silently falls back to the shipped browser.
 *
 * Neither file can import the other: the config is TypeScript and the check is a
 * plain script the CI step runs with `node`. So this test compares the two
 * literals as text, which is exactly the invariant at stake.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The quoted entries of one list literal, in declaration order. */
async function listFrom(file: string, start: string, end: string): Promise<readonly string[]> {
  // `pnpm test` runs from the repository root, which is where both files live.
  const text = await readFile(join(process.cwd(), file), 'utf8')
  const from = text.indexOf(start)
  const to = text.indexOf(end, from + start.length)
  expect(from, `${file} has no ${start}`).toBeGreaterThan(-1)
  expect(to, `${file} has no ${end} after ${start}`).toBeGreaterThan(from)
  return [...text.slice(from, to).matchAll(/'([^']+)'/g)]
    .map(match => match[1] as string)
    .filter(entry => !entry.startsWith('@override'))
}

describe('client bundle baseline', () => {
  it('names the same modules in the build config and in the purity check', async () => {
    const bundledOut = await listFrom('tsdown.config.ts', 'const PLATFORM_MODULES', 'export default')
    const allowed = await listFrom('scripts/check-client-purity.mjs', 'const BASELINE', 'const bundle')
    expect(bundledOut.length).toBeGreaterThan(0)
    expect(allowed).toEqual(bundledOut)
  })
})
