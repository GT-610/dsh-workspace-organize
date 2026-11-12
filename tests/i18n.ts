/**
 * English copy for the tests, resolved through the same `messagesFrom` the
 * browser uses.
 *
 * The component takes the framework `t` seat, so a test mount passes
 * {@link translate} and a test assertion compares against {@link messages} —
 * both derived from the plugin's real dictionary, never a second copy.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { EN_DICT, ZH_DICT, messagesFrom, type Messages } from '../src/client/i18n.ts'

/** Replace `{name}` placeholders the way the locale service does. */
function interpolate(template: string, params?: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params?.[key] === undefined ? match : String(params[key]))
}

/**
 * A bound translate function over one of the plugin's dictionaries.
 * @param locale - dictionary to read; English by default.
 * @returns the `t` seat a mounted browser expects.
 */
export function translate(locale: 'en' | 'zh' = 'en'): TranslateNS<'workspaceOrganize'> {
  const dict = locale === 'zh' ? ZH_DICT : EN_DICT
  return ((key: keyof typeof EN_DICT, params?: Record<string, unknown>) =>
    interpolate(dict[key], params)) as TranslateNS<'workspaceOrganize'>
}

/** The English copy the tests assert against. */
export const messages: Messages = messagesFrom(translate())
