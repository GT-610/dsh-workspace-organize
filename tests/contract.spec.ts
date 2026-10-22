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
  MAX_GROUP_NAME_LENGTH,
  MAX_ID_LENGTH,
  MAX_MEMBERS_PER_GROUP,
  MAX_TOTAL_MEMBERS,
  emptyGroupDocument,
  normalizeGroupDocument,
} from '../src/shared/contract.ts'

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
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: '', name: 'a', workspaceIds: [] }] })).toBeNull()
    expect(normalizeGroupDocument({
      version: 1,
      groups: [{ id: 'x'.repeat(MAX_ID_LENGTH + 1), name: 'a', workspaceIds: [] }],
    })).toBeNull()
    expect(normalizeGroupDocument({
      version: 1,
      groups: [{ id: 'g', name: 'x'.repeat(MAX_GROUP_NAME_LENGTH + 1), workspaceIds: [] }],
    })).toBeNull()
    expect(normalizeGroupDocument({
      version: 1,
      groups: [{
        id: 'g',
        name: 'a',
        workspaceIds: Array.from({ length: MAX_MEMBERS_PER_GROUP + 1 }, (_unused, index) => `w${index}`),
      }],
    })).toBeNull()
    expect(normalizeGroupDocument({
      version: 1,
      groups: [{ id: 'g', name: 'a', workspaceIds: ['x'.repeat(MAX_ID_LENGTH + 1)] }],
    })).toBeNull()
    expect(normalizeGroupDocument({ version: 1, groups: [{ id: 'g', name: 'a', workspaceIds: [''] }] })).toBeNull()
  })

  it('rejects too many groups', () => {
    const groups = Array.from(
      { length: MAX_GROUPS + 1 },
      (_unused, index) => ({ id: `g${index}`, name: 'a', workspaceIds: [] }),
    )
    expect(normalizeGroupDocument({ version: 1, groups })).toBeNull()
  })

  it('rejects a document holding more members than the whole-document cap', () => {
    const groups = []
    for (let index = 0; index * MAX_MEMBERS_PER_GROUP <= MAX_TOTAL_MEMBERS; index += 1) {
      const members = Array.from(
        { length: MAX_MEMBERS_PER_GROUP },
        (_unused, member) => `w${index}-${member}`,
      )
      groups.push({ id: `g${index}`, name: 'a', workspaceIds: members })
    }
    expect(normalizeGroupDocument({ version: 1, groups })).toBeNull()
  })

  it('accepts a group at the per-group member cap', () => {
    const workspaceIds = Array.from({ length: MAX_MEMBERS_PER_GROUP }, (_unused, member) => `w${member}`)
    const doc = normalizeGroupDocument({ version: 1, groups: [{ id: 'g', name: 'a', workspaceIds }] })
    expect(doc?.groups[0]?.workspaceIds).toHaveLength(MAX_MEMBERS_PER_GROUP)
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

  it('keeps the worst-escaping document inside the body cap', () => {
    // The two limits have to agree: a document the validator accepts must be one
    // the route can receive, or a legal edit would fail before validation ran.
    //
    // This is the true maximum. The group cap and the member cap cannot both be
    // saturated, so the widest document is `MAX_GROUPS` records sharing
    // `MAX_TOTAL_MEMBERS` between them, every id and name filled with control
    // characters (six bytes each as `\uXXXX`).
    const perGroup = Math.floor(MAX_TOTAL_MEMBERS / MAX_GROUPS)
    const groups = Array.from({ length: MAX_GROUPS }, (_unused, groupIndex) => ({
      id: widen(`g${String(groupIndex).padStart(3, '0')}`, MAX_ID_LENGTH),
      name: '\u0001'.repeat(MAX_GROUP_NAME_LENGTH),
      workspaceIds: Array.from(
        { length: perGroup },
        (_slot, memberIndex) => widen(
          `w${String(groupIndex * perGroup + memberIndex).padStart(4, '0')}`,
          MAX_ID_LENGTH,
        ),
      ),
    }))
    const doc = normalizeGroupDocument({ version: 1, groups })
    expect(doc).not.toBeNull()
    expect(new Set(doc?.groups.flatMap(group => group.workspaceIds)).size).toBe(MAX_TOTAL_MEMBERS)
    const body = Buffer.byteLength(JSON.stringify(doc), 'utf8')
    // A lower bound keeps the measurement honest: a document this wide really is
    // megabytes of escapes, so the upper bound below is a real limit and not a
    // tautology about a small document.
    expect(body).toBeGreaterThan(1_000_000)
    expect(body).toBeLessThan(MAX_DOCUMENT_BYTES)
  })
})
