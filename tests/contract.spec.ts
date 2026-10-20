/**
 * The shared group-document contract: what the Host stores and the Client edits.
 *
 * The validator is the single gate on both sides, so these cases are the
 * specification of what a document may contain.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_DOCUMENT_BYTES,
  MAX_GROUPS,
  MAX_MEMBERS_PER_GROUP,
  MAX_TOTAL_MEMBERS,
  emptyGroupDocument,
  normalizeGroupDocument,
} from '../src/shared/contract.ts'
import { sameOriginWrite } from '../src/index.ts'
import type { IncomingMessage } from 'node:http'

/** A minimal request carrying only headers. */
function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

/**
 * A string of exactly `width` code units that costs the most in a JSON body:
 * control characters escape to `\uXXXX`, six bytes each, and the trailing ASCII
 * tag keeps it distinct from its siblings.
 * @param tag - distinct ASCII suffix.
 * @param width - total length in code units.
 * @returns the padded id.
 */
function widen(tag: string, width: number): string {
  return `${'\u0001'.repeat(width - tag.length)}${tag}`
}

describe('normalizeGroupDocument', () => {
  it('accepts a document and drops unknown fields', () => {
    const doc = normalizeGroupDocument({
      version: 99,
      extra: true,
      groups: [{ id: 'g1', name: 'Work', workspaceIds: ['w1', 'w2'], colour: 'red' }],
    })
    expect(doc).toEqual({ version: 1, groups: [{ id: 'g1', name: 'Work', workspaceIds: ['w1', 'w2'] }] })
  })

  it('accepts an empty document', () => {
    expect(normalizeGroupDocument({ version: 1, groups: [] })).toEqual(emptyGroupDocument())
  })

  it('rejects a shape that is not a document', () => {
    for (const raw of [null, 42, 'groups', [], { groups: 'none' }, { groups: [null] }, { groups: [{}] }]) {
      expect(normalizeGroupDocument(raw)).toBeNull()
    }
  })

  it('rejects a duplicate group id', () => {
    expect(normalizeGroupDocument({
      version: 1,
      groups: [
        { id: 'g1', name: 'a', workspaceIds: [] },
        { id: 'g1', name: 'b', workspaceIds: [] },
      ],
    })).toBeNull()
  })

  it('rejects an over-long id, name, or member list', () => {
    const member = 'w1'
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: '', name: 'a', workspaceIds: [] }] })).toBeNull()
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: 'x'.repeat(129), name: 'a', workspaceIds: [] }] })).toBeNull()
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: 'g', name: 'x'.repeat(201), workspaceIds: [] }] })).toBeNull()
    expect(normalizeGroupDocument({
      version: 1,
      groups: [{ id: 'g', name: 'a', workspaceIds: Array.from({ length: 501 }, () => member) }],
    })).toBeNull()
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: 'g', name: 'a', workspaceIds: [''] }] })).toBeNull()
  })

  it('rejects too many groups', () => {
    const groups = Array.from({ length: 201 }, (_, index) => ({ id: `g${index}`, name: 'a', workspaceIds: [] }))
    expect(normalizeGroupDocument({ version: 1, groups })).toBeNull()
  })

  it('rejects a document holding more members than the whole-document cap', () => {
    const perGroup = Math.floor(MAX_MEMBERS_PER_GROUP)
    const groups = []
    for (let index = 0; index * perGroup <= MAX_TOTAL_MEMBERS; index += 1) {
      const members = Array.from({ length: perGroup }, (_, member) => `w${index}-${member}`)
      groups.push({ id: `g${index}`, name: 'a', workspaceIds: members })
    }
    expect(normalizeGroupDocument({ version: 1, groups })).toBeNull()
  })
})

describe('normalizeGroupDocument membership', () => {
  it('drops a member that already sits in an earlier group', () => {
    const doc = normalizeGroupDocument({
      version: 1,
      groups: [
        { id: 'g1', name: 'A', workspaceIds: ['w1', 'w2'] },
        { id: 'g2', name: 'B', workspaceIds: ['w2', 'w3'] },
      ],
    })
    expect(doc?.groups).toEqual([
      { id: 'g1', name: 'A', workspaceIds: ['w1', 'w2'] },
      { id: 'g2', name: 'B', workspaceIds: ['w3'] },
    ])
  })

  it('drops a repeated member inside one group', () => {
    const doc = normalizeGroupDocument({
      version: 1,
      groups: [{ id: 'g1', name: 'A', workspaceIds: ['w1', 'w1', 'w2'] }],
    })
    expect(doc?.groups).toEqual([{ id: 'g1', name: 'A', workspaceIds: ['w1', 'w2'] }])
  })

  it('keeps a document at its structural limits inside the body cap', () => {
    // The two limits have to agree: a document the validator accepts must be
    // one the route can receive, or a legal edit would fail as a 400.
    const groupCount = MAX_TOTAL_MEMBERS / MAX_MEMBERS_PER_GROUP
    const groups = Array.from({ length: groupCount }, (_unused, groupIndex) => ({
      id: `g${String(groupIndex).padStart(3, '0')}`,
      name: 'x'.repeat(200),
      workspaceIds: Array.from(
        { length: MAX_MEMBERS_PER_GROUP },
        (_slot, memberIndex) => `w${groupIndex}-${'y'.repeat(110)}${memberIndex}`,
      ),
    }))
    const doc = normalizeGroupDocument({ version: 1, groups })
    expect(doc).not.toBeNull()
    expect(Buffer.byteLength(JSON.stringify(doc), 'utf8')).toBeLessThan(MAX_DOCUMENT_BYTES)
  })

  it('keeps the worst-escaping document four groups can hold inside the body cap', () => {
    // Ids are not free: one control character becomes `\uXXXX` in the body, six
    // bytes for one code unit. Four groups of 500 members with 128-character ids
    // of nothing but control characters is the largest encoding this shape can
    // produce, and it has to survive the route's byte cap.
    const groups = Array.from({ length: MAX_TOTAL_MEMBERS / MAX_MEMBERS_PER_GROUP }, (_unused, groupIndex) => ({
      id: widen(`g${groupIndex}`, 128),
      name: '\u0001'.repeat(200),
      workspaceIds: Array.from(
        { length: MAX_MEMBERS_PER_GROUP },
        (_slot, memberIndex) => widen(`w${groupIndex}${String(memberIndex).padStart(3, '0')}`, 128),
      ),
    }))
    const doc = normalizeGroupDocument({ version: 1, groups })
    expect(doc).not.toBeNull()
    expect(new Set(doc?.groups.flatMap(group => group.workspaceIds)).size).toBe(MAX_TOTAL_MEMBERS)
    const body = Buffer.byteLength(JSON.stringify(doc), 'utf8')
    expect(body).toBeGreaterThan(1_000_000)
    expect(body).toBeLessThan(MAX_DOCUMENT_BYTES)
  })

  it('keeps the worst-escaping document at the group cap inside the body cap', () => {
    // The group cap and the member cap cannot both be saturated, so this is the
    // true maximum: 200 group records, all with maximal names and ids, sharing
    // the 2 000 members between them.
    const perGroup = Math.floor(MAX_TOTAL_MEMBERS / MAX_GROUPS)
    const groups = Array.from({ length: MAX_GROUPS }, (_unused, groupIndex) => ({
      id: widen(`g${String(groupIndex).padStart(3, '0')}`, 128),
      name: '\u0001'.repeat(200),
      workspaceIds: Array.from(
        { length: perGroup },
        (_slot, memberIndex) => widen(`w${String(groupIndex * perGroup + memberIndex).padStart(4, '0')}`, 128),
      ),
    }))
    const doc = normalizeGroupDocument({ version: 1, groups })
    expect(doc).not.toBeNull()
    expect(Buffer.byteLength(JSON.stringify(doc), 'utf8')).toBeLessThan(MAX_DOCUMENT_BYTES)
  })
})

describe('sameOriginWrite', () => {
  it('accepts a same-origin or extension-less browser write', () => {
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'same-origin', host: 'localhost:3080' }))).toBe(true)
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'none', host: 'localhost:3080' }))).toBe(true)
  })

  it('refuses a cross-site write', () => {
    expect(sameOriginWrite(request({ 'sec-fetch-site': 'cross-site', host: 'localhost:3080' }))).toBe(false)
  })

  it('falls back to the Origin header when Sec-Fetch-Site is absent', () => {
    expect(sameOriginWrite(request({ origin: 'http://localhost:3080', host: 'localhost:3080' }))).toBe(true)
    expect(sameOriginWrite(request({ origin: 'http://evil.test', host: 'localhost:3080' }))).toBe(false)
    expect(sameOriginWrite(request({ origin: 'not a url', host: 'localhost:3080' }))).toBe(false)
  })

  it('refuses a request carrying neither header — not a browser JSON POST', () => {
    expect(sameOriginWrite(request({ host: 'localhost:3080' }))).toBe(false)
  })
})
