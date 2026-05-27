import type { ExportableSubject, SubjectTagLetter } from './types'

const SUBJECT_TAG_LETTERS = new Set<SubjectTagLetter>(['p', 'e', 'a'])
const OUTPUT_EVENT_KIND = 37573

export interface ValidOutput {
  ok: true
  dTag: string
  subjects: ExportableSubject[]
}

export interface InvalidOutput {
  ok: false
  reason: string
}

export type OutputValidation = ValidOutput | InvalidOutput

/** Minimal shape required for output validation (kind + tags). */
export interface OutputEventLike {
  kind?: number | null
  tags: string[][]
}

function parseRank(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const parsed = parseFloat(raw)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

/**
 * Validate a fetched kind-37573 output event and extract its subject tags.
 *
 * Output tags use the positional layout:
 *   [tag_letter, subject, rank, pov_rank?, ranking_metadata_json?]
 *
 * - `tag_letter` is one of `p`, `e`, or `a`.
 * - `subject` is the entity identifier (pubkey, event id, or `<kind>:<author>:<d>`).
 * - `rank` is a numeric string. Tags with non-numeric ranks are skipped.
 */
export function validateOutputEvent(event: OutputEventLike | null | undefined): OutputValidation {
  if (!event) return { ok: false, reason: 'Output event not found' }

  if (event.kind !== OUTPUT_EVENT_KIND) {
    return { ok: false, reason: `Unexpected event kind ${event.kind}; expected ${OUTPUT_EVENT_KIND}` }
  }

  const dTag = event.tags.find(tag => tag[0] === 'd')?.[1]
  if (!dTag) return { ok: false, reason: 'Output event missing `d` tag' }

  const subjects: ExportableSubject[] = []
  for (const tag of event.tags) {
    const letter = tag[0]
    if (!SUBJECT_TAG_LETTERS.has(letter as SubjectTagLetter)) continue

    const value = tag[1]
    if (!value) continue

    const rank = parseRank(tag[2])
    if (rank === null) continue

    subjects.push({
      tagLetter: letter as SubjectTagLetter,
      value,
      rank,
      raw: tag,
    })
  }

  if (subjects.length === 0) {
    return { ok: false, reason: 'Output event has no well-formed result tags' }
  }

  return { ok: true, dTag, subjects }
}
