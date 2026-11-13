// @vitest-environment jsdom
/**
 * The client entry: what it registers, and how its operations degrade.
 *
 * `Browser.tsx` gets its services through the face this module injects, so the
 * fallback rules here are the difference between one dead action and a sidebar
 * that fails to mount. Nothing else in the suite touches this file.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.tsx'
import { EN_DICT, LOCALE_NS, ZH_DICT } from '../src/client/i18n.ts'
import type { OrganizeBrowserInjected, Services } from '../src/client/contract.ts'

/** What `apply` handed to the slot registry and the locale service. */
interface Captured {
  registered?: { name: string; priority?: number; locale?: string; inject: () => OrganizeBrowserInjected }
  dictionaries?: { namespace: string; dictionaries: unknown }
}

/** A client context carrying only what `apply` reaches for. */
function mountClient(services: Readonly<Record<string, unknown>> = {}): {
  captured: Captured
  warnings: readonly string[]
} {
  const captured: Captured = {}
  const warnings: string[] = []
  const ctx = {
    get: (name: string) => services[name],
    effect: (fn: () => unknown) => fn(),
    locale: {
      register: (namespace: string, dictionaries: unknown) => {
        captured.dictionaries = { namespace, dictionaries }
        return () => undefined
      },
    },
    slots: {
      inject: (_name: string, register: () => unknown) => register(),
      register: (entry: Captured['registered']) => {
        captured.registered = entry
        return () => undefined
      },
    },
  } as unknown as Context
  vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message))
  })
  apply(ctx)
  return { captured, warnings }
}

/** The operation face the entry injects for itself. */
function servicesOf(captured: Captured): Services {
  expect(captured.registered).toBeDefined()
  return captured.registered?.inject().services as Services
}

describe('client entry', () => {
  it('registers both dictionaries under the plugin namespace', () => {
    const { captured } = mountClient()
    expect(captured.dictionaries?.namespace).toBe(LOCALE_NS)
    expect(captured.dictionaries?.dictionaries).toEqual({ en: EN_DICT, zh: ZH_DICT })
  })

  it('shadows the shipped browser at a lower priority and claims the namespace', () => {
    const { captured } = mountClient()
    expect(captured.registered?.name).toBe('sidebar.workspaces')
    // The shipped entry registers at 0 and must stay registered for its children.
    expect(captured.registered?.priority).toBe(-100)
    expect(captured.registered?.locale).toBe(LOCALE_NS)
  })

  it('turns one missing service into a reported no-op instead of a failed mount', () => {
    const { captured, warnings } = mountClient()
    const services = servicesOf(captured)
    expect(() => services.openSession('s1' as never)).not.toThrow()
    expect(() => services.startSession('w1' as never)).not.toThrow()
    expect(warnings.join('\n')).toContain('uiWorkspace is unavailable; openSession is a no-op')
    expect(warnings.join('\n')).toContain('uiWorkspace is unavailable; startSession is a no-op')
  })

  it('falls back to the workspaces service for archive and restore', async () => {
    const archiveSession = vi.fn().mockResolvedValue(undefined)
    const unarchiveSession = vi.fn().mockResolvedValue(undefined)
    const { captured } = mountClient({ workspaces: { archiveSession, unarchiveSession } })
    const services = servicesOf(captured)
    await services.archiveSession('s1' as never)
    expect(archiveSession).toHaveBeenCalledWith('s1', undefined)
    await services.unarchiveSession('s1' as never)
    expect(unarchiveSession).toHaveBeenCalledWith('s1')
  })

  it('drives the official UI face when the carrier has one', async () => {
    const openSession = vi.fn()
    const startSession = vi.fn()
    const pickDirectory = vi.fn().mockResolvedValue('/tmp/picked')
    const { captured } = mountClient({ uiWorkspace: { openSession, startSession, pickDirectory } })
    const services = servicesOf(captured)
    services.openSession('s1' as never)
    services.startSession('w1' as never)
    expect(openSession).toHaveBeenCalledWith('s1')
    expect(startSession).toHaveBeenCalledWith('w1')
    await expect(services.pickDirectory()).resolves.toBe('/tmp/picked')
  })

  it('resolves a pick to nothing when the environment has no picker', async () => {
    const { captured, warnings } = mountClient()
    await expect(servicesOf(captured).pickDirectory()).resolves.toBeNull()
    expect(warnings.join('\n')).toContain('pickDirectory is a no-op')
  })

  it('reports a Workspace rename as settled once the official one is', async () => {
    const rename = vi.fn().mockResolvedValue(undefined)
    const { captured } = mountClient({ workspaces: { rename } })
    await expect(servicesOf(captured).renameWorkspace('w1' as never, 'New')).resolves.toBeUndefined()
    expect(rename).toHaveBeenCalledWith('w1', 'New')
  })

  it('applies a Session rename through the binding the controller lends', async () => {
    const rename = vi.fn().mockResolvedValue(undefined)
    const using = vi.fn(async (
      _sessionId: unknown,
      _options: unknown,
      run: (reference: { binding: { session: { rename: typeof rename } } }) => Promise<void>,
    ) => {
      await run({ binding: { session: { rename } } })
      return { ok: true }
    })
    const { captured } = mountClient({ sessions: { using } })
    await servicesOf(captured).renameSession('s1' as never, 'New')
    expect(rename).toHaveBeenCalledWith('New')
  })

  it('surfaces a refused Session rename and a missing sessions service', async () => {
    const refused = mountClient({ sessions: { using: vi.fn().mockResolvedValue({ ok: false, error: { message: 'nope' } }) } })
    await expect(servicesOf(refused.captured).renameSession('s1' as never, 'New')).rejects.toThrow('nope')
    const absent = mountClient()
    await expect(servicesOf(absent.captured).renameSession('s1' as never, 'New'))
      .rejects.toThrow('sessions service is unavailable')
  })
})
