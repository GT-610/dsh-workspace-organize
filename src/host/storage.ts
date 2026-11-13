/**
 * Where the group document lives, and how one copy of it is read and written.
 *
 * The file sits in `$DSH_HOME/storages`, the directory the workspace domain
 * itself uses, and every write commits through a temporary file and a rename so
 * a half-written document can never be the one a reload reads back.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import {
  emptyGroupDocument,
  normalizeGroupDocument,
  type GroupDocument,
} from '../shared/contract.ts'

/**
 * Expand the one tilde prefix the harness accepts in a configured path.
 * @param path - configured path, possibly starting with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the input unchanged when it has no prefix.
 */
function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the DeepSeek Harness home exactly as the rest of the Host does
 * (`@deepseek-ai/dsh-home-paths`' `resolveDshHome`).
 *
 * Reading `DSH_HOME` raw would diverge in three ways that matter here: a blank
 * override would resolve this plugin's storage to a `storages` directory under
 * the process cwd instead of `~/.dsh`, a `~/…` override would be taken
 * literally and create a directory named `~`, and a relative one would keep
 * depending on the cwd. The document would then land outside the tree every
 * other DSH component reads, and look lost.
 * @param env - environment to read; defaults to the process environment.
 * @returns the absolute harness home.
 */
export function resolveDshHome(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.DSH_HOME
  return resolvePath(
    configured !== undefined && configured.trim().length > 0
      ? expandHomePath(configured)
      : join(homedir(), '.dsh'),
  )
}

/**
 * Read and validate one stored group document.
 *
 * A missing file is a fresh install and reads as an empty document. Any other
 * failure — an unreadable file, malformed JSON, or a shape the validator
 * rejects — is thrown: answering "empty" there would let the Client discard its
 * localStorage mirror and show an installation with no groups.
 * @param file - absolute path of the stored document.
 * @returns the normalized document.
 * @throws when the file exists but cannot be read or validated.
 */
export async function readStoredDocument(file: string): Promise<GroupDocument> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyGroupDocument()
    throw error
  }
  const doc = normalizeGroupDocument(JSON.parse(text))
  if (doc === null) throw new Error('stored group document is invalid')
  return doc
}

/**
 * Commit one document through a temporary file and a rename.
 *
 * The rename is the commit point: a reader either sees the previous document or
 * this one, never a partial write.
 * @param dir - directory the document belongs in; created when absent.
 * @param file - absolute path of the stored document.
 * @param doc - the document to store.
 */
export async function writeStoredDocument(dir: string, file: string, doc: GroupDocument): Promise<void> {
  await mkdir(dir, { recursive: true })
  const tmp = `${file}.${String(process.pid)}.tmp`
  await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}
